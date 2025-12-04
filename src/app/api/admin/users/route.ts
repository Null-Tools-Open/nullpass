import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'

const INTERNAL_SECRET = process.env.INTERNAL_SECRET

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const internalSecret = request.headers.get('x-internal-secret')
  const isInternal = INTERNAL_SECRET && internalSecret === INTERNAL_SECRET

  if (!isInternal) {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return errorResponse('Unauthorized', 401, request.headers.get('origin'))
    }

    const dropService = await prisma.userServiceEntitlement.findUnique({
      where: {
        userId_service: {
          userId: auth.userId,
          service: 'DROP',
        },
      },
    })

    const accessFlags = (dropService?.accessFlags as any) || {}
    const isAdmin = accessFlags.isNullDropTeam && ['founder', 'dev'].includes(accessFlags.nullDropTeamRole)

    if (!isAdmin) {
      return errorResponse('Forbidden - Admin access required', 403, request.headers.get('origin'))
    }
  }

  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
          serviceAccess: {
            where: {
              service: 'DROP',
            },
            select: {
              id: true,
              service: true,
              tier: true,
              isPremium: true,
              accessFlags: true,
              metadata: true,
              customStorageLimit: true,
              customApiKeyLimit: true,
            },
          },
        },
      }),
      prisma.user.count(),
    ])

    const mappedUsers = users.map(user => {
      const dropService = user.serviceAccess?.[0]
      const accessFlags = (dropService?.accessFlags as any) || {}

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        serviceAccess: {
          tier: dropService?.tier || 'free',
          isPremium: dropService?.isPremium || false,
          accessFlags: accessFlags,
          metadata: dropService?.metadata || {},
          customStorageLimit: dropService?.customStorageLimit || null,
          customApiKeyLimit: dropService?.customApiKeyLimit || null,
        },
      }
    })

    return jsonResponse(
      {
        users: mappedUsers,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: skip + mappedUsers.length < totalCount,
        },
      },
      200,
      request.headers.get('origin')
    )
  } catch (error) {
    logger.error('Get admin users error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}