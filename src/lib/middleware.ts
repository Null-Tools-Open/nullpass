import { NextRequest } from 'next/server'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/response'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function requireAuth(request: NextRequest) {
  const token = getTokenFromRequest(request)
  
  if (!token) {
    logger.warn('requireAuth: No token in Authorization header')
    return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
  }

  const payload = verifyToken(token)
  if (!payload || !payload.userId) {
    logger.warn('requireAuth: Invalid JWT token', { 
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...'
    })
    return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
  }

  try {
    logger.info('requireAuth: Looking for session in database', {
      userId: payload.userId,
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...',
    })

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

      logger.warn('requireAuth: Session not found in database', { 
        userId: payload.userId,
        tokenLength: token.length,
        tokenPreview: token.substring(0, 20) + '...',
        userSessionsCount: userSessions.length,
        userSessions: userSessions.map(s => ({
          id: s.id,
          tokenPreview: s.token.substring(0, 20) + '...',
          expiresAt: s.expiresAt,
          createdAt: s.createdAt,
        })),
      })
      return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
    }

    logger.info('requireAuth: Session found in database', {
      sessionId: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    })

    if (session.expiresAt < new Date()) {
      logger.warn('requireAuth: Session expired', { 
        userId: payload.userId,
        expiresAt: session.expiresAt 
      })
      return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
    }

    if (session.userId !== payload.userId) {
      logger.warn('requireAuth: UserId mismatch', { 
        sessionUserId: session.userId,
        payloadUserId: payload.userId 
      })
      return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
    }

    logger.info('requireAuth: Success', { userId: payload.userId })
    return { userId: payload.userId }
  } catch (error) {
    logger.error('requireAuth: Database error', error)
    return { error: errorResponse('Internal server error', 500, request.headers.get('origin')) }
  }
}