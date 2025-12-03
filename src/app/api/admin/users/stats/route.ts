import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'

const INTERNAL_SECRET = process.env.INTERNAL_SECRET

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const internalSecret = request.headers.get('x-internal-secret')
  const isInternal = INTERNAL_SECRET && internalSecret === INTERNAL_SECRET

  if (!isInternal) {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return auth.error
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
    const totalUsers = await prisma.user.count()
    
    const premiumUsers = await prisma.userServiceEntitlement.count({
      where: {
        service: 'DROP',
        isPremium: true,
      },
    })

    return jsonResponse({
      totalUsers,
      premiumUsers,
      freeUsers: totalUsers - premiumUsers,
    }, 200, request.headers.get('origin'))
  } catch (error) {
    console.error('Admin users stats error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}