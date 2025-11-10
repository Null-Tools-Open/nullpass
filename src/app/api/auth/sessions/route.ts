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
    const sessions = await prisma.session.findMany({
      where: {
        userId: auth.userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ip: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    return jsonResponse({ sessions }, 200, request.headers.get('origin'))
  } catch (error) {
    logger.error('Get sessions error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}

export async function DELETE(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('id')

    if (sessionId) {
      await prisma.session.deleteMany({
        where: {
          id: sessionId,
          userId: auth.userId,
        },
      })
      logger.info('Session deleted:', sessionId, auth.userId)
    } else {
      await prisma.session.deleteMany({
        where: { userId: auth.userId },
      })
      logger.info('All sessions deleted for user:', auth.userId)
    }

    return jsonResponse({ success: true }, 200, request.headers.get('origin'))
  } catch (error) {
    logger.error('Delete session error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}