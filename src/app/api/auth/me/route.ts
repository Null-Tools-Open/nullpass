import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional().or(z.literal('')),
})

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        avatar: true,
        displayName: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        serviceAccess: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404, request.headers.get('origin'))
    }

    return jsonResponse({ user }, 200, request.headers.get('origin'))
  } catch (error) {
    logger.error('Get user error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}

export async function PATCH(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const validated = updateProfileSchema.parse(body)

    const updateData: {
      displayName?: string
      avatar?: string | null
    } = {}

    if (validated.displayName !== undefined) {
      updateData.displayName = validated.displayName
    }

    if (validated.avatar !== undefined) {
      updateData.avatar = validated.avatar === '' ? null : validated.avatar
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse('No fields to update', 400, request.headers.get('origin'))
    }

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        avatar: true,
        displayName: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await createAuditLog(auth.userId, 'USER_UPDATE', {
      fields: Object.keys(updateData),
    })

    return jsonResponse({ user }, 200, request.headers.get('origin'))
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Profile update validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Update profile error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}