import { NextRequest } from 'next/server'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/response'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function requireAuth(request: NextRequest) {
  const token = getTokenFromRequest(request)
  
  if (!token) {
    logger.warn('[RA]: No token in Authorization header')
    return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
  }

  const payload = verifyToken(token)
  if (!payload || !payload.userId) {
    return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
  }

  try {

    const session = await prisma.session.findUnique({
      where: { token },
      select: {
        userId: true,
        expiresAt: true,
        id: true,
        createdAt: true,
      },
    })

    if (!session) {
      const userSessions = await prisma.session.findMany({
        where: { userId: payload.userId },
        select: {
          id: true,
          token: true,
          expiresAt: true,
          createdAt: true,
        },
        take: 3,
        orderBy: { createdAt: 'desc' },
      })
      return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
    }

    if (session.expiresAt < new Date()) {
      logger.warn('[RA]: Session expired', { 
        userId: payload.userId,
        expiresAt: session.expiresAt 
      })
      return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
    }

    if (session.userId !== payload.userId) {
      logger.warn('[RA]: UserId mismatch', { 
        sessionUserId: session.userId,
        payloadUserId: payload.userId 
      })
      return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
    }
    
    return { userId: payload.userId }

  } catch (error) {
    // if this ever happens, we're fucking dead
    logger.error('[TURBO WPIERDOL!!]: Database error', error)
    return { error: errorResponse('Internal server error', 500, request.headers.get('origin')) }
  }
}