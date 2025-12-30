import { NextRequest } from 'next/server'
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
    const { searchParams } = new URL(request.url)
    const service = searchParams.get('service') as 'DROP' | 'MAILS' | 'VAULT' | 'DB' | 'BOARD' | null

    if (!service) {
      return errorResponse('Service parameter is required', 400, request.headers.get('origin'))
    }

    if (!['DROP', 'MAILS', 'VAULT', 'DB', 'BOARD'].includes(service)) {
      return errorResponse('Invalid service. Must be DROP, MAILS, VAULT, DB, or BOARD', 400, request.headers.get('origin'))
    }

    const entitlement = await prisma.userServiceEntitlement.findUnique({
      where: {
        userId_service: {
          userId: auth.userId,
          service: service,
        },
      },
    })

    if (!entitlement) {
      return jsonResponse(
        {
          connected: false,
          service,
          message: 'No entitlement found for this service',
        },
        200,
        request.headers.get('origin')
      )
    }

    return jsonResponse(
      {
        connected: (entitlement as any).connected ?? true,
        service: entitlement.service,
        tier: entitlement.tier,
        isPremium: entitlement.isPremium,
      },
      200,
      request.headers.get('origin')
    )
  } catch (error) {
    logger.error('Check connection status error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}