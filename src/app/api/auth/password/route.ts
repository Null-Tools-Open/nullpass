import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request, { requested: 2 })
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const validated = changePasswordSchema.parse(body)

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        passwordHash: true,
      },
    })

    if (!user || !user.passwordHash) {
      return errorResponse('User not found', 404, request.headers.get('origin'))
    }

    const isValid = await bcrypt.compare(validated.currentPassword, user.passwordHash)
    if (!isValid) {
      logger.warn('Password change failed: Invalid current password', auth.userId)
      return errorResponse('Invalid current password', 401, request.headers.get('origin'))
    }

    const newPasswordHash = await bcrypt.hash(validated.newPassword, 10)

    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        passwordHash: newPasswordHash,
      },
    })

    logger.info('Password changed:', auth.userId)

    return jsonResponse({ success: true, message: 'Password changed successfully' }, 200, request.headers.get('origin'))
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Password change validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Change password error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}