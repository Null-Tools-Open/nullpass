import { NextRequest } from 'next/server'
import { getUserIdFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'

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
      include: {
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