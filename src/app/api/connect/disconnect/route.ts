import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const disconnectSchema = z.object({
  service: z.enum(['DROP', 'MAILS', 'VAULT', 'DB', 'BOARD']),
})

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const validated = disconnectSchema.parse(body)

    logger.ups('Service disconnect request:', auth.userId, validated.service)

    const existingEntitlement = await prisma.userServiceEntitlement.findUnique({
      where: {
        userId_service: {
          userId: auth.userId,
          service: validated.service,
        },
      },
    })

    if (!existingEntitlement) {
      return errorResponse(
        'Service entitlement not found. Please ensure you have access to this service.',
        404,
        request.headers.get('origin')
      )
    }

    if (!(existingEntitlement as any).connected) {
      return jsonResponse(
        {
          connected: false,
          service: validated.service,
          message: 'Already disconnected from this service',
        },
        200,
        request.headers.get('origin')
      )
    }

    const entitlement = await prisma.userServiceEntitlement.update({
      where: {
        userId_service: {
          userId: auth.userId,
          service: validated.service,
        },
      },
      data: {
        connected: false,
        updatedAt: new Date(),
      } as any,
    })

    await createAuditLog(auth.userId, 'SERVICE_ENTITLEMENT_DISCONNECT', {
      service: validated.service,
    })

    logger.info('Service disconnected:', auth.userId, validated.service)

    return jsonResponse(
      {
        connected: false,
        service: entitlement.service,
        tier: entitlement.tier,
        isPremium: entitlement.isPremium,
        message: 'Successfully disconnected from service',
      },
      200,
      request.headers.get('origin')
    )
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Disconnect service validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Disconnect service error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}