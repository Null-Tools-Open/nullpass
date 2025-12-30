import { NextRequest } from 'next/server'
import { getUserIdFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { z } from 'zod'

const updateServiceSchema = z.object({
  service: z.enum(['DROP', 'MAILS', 'VAULT', 'DB', 'BOARD']),
  tier: z.string().optional(),
  isPremium: z.boolean().optional(),
  accessFlags: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  customStorageLimit: z.number().optional(),
  customApiKeyLimit: z.number().optional(),
  polarCustomerId: z.string().optional(),
  polarSubscriptionId: z.string().optional(),
  polarSubscriptionStatus: z.string().optional(),
})

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

    const where: any = { userId: auth.userId }
    if (service) {
      where.service = service
    }

    const entitlements = await prisma.userServiceEntitlement.findMany({
      where,
    })

    return jsonResponse({ entitlements }, 200, request.headers.get('origin'))
  } catch (error) {
    logger.error('Get service access error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const validated = updateServiceSchema.parse(body)

    logger.ups('Service entitlement update:', auth.userId, validated.service)

    const entitlement = await prisma.userServiceEntitlement.upsert({
      where: {
        userId_service: {
          userId: auth.userId,
          service: validated.service,
        },
      },
      update: {
        ...(validated.tier !== undefined && { tier: validated.tier }),
        ...(validated.isPremium !== undefined && { isPremium: validated.isPremium }),
        ...(validated.accessFlags !== undefined && { accessFlags: validated.accessFlags }),
        ...(validated.metadata !== undefined && { metadata: validated.metadata }),
        ...(validated.customStorageLimit !== undefined && { customStorageLimit: validated.customStorageLimit }),
        ...(validated.customApiKeyLimit !== undefined && { customApiKeyLimit: validated.customApiKeyLimit }),
        ...(validated.polarCustomerId !== undefined && { polarCustomerId: validated.polarCustomerId }),
        ...(validated.polarSubscriptionId !== undefined && { polarSubscriptionId: validated.polarSubscriptionId }),
        ...(validated.polarSubscriptionStatus !== undefined && { polarSubscriptionStatus: validated.polarSubscriptionStatus }),
        updatedAt: new Date(),
      },
      create: {
        userId: auth.userId,
        service: validated.service,
        tier: validated.tier || 'free',
        isPremium: validated.isPremium || false,
        accessFlags: validated.accessFlags || undefined,
        metadata: validated.metadata || undefined,
        customStorageLimit: validated.customStorageLimit || null,
        customApiKeyLimit: validated.customApiKeyLimit || null,
        polarCustomerId: validated.polarCustomerId || null,
        polarSubscriptionId: validated.polarSubscriptionId || null,
        polarSubscriptionStatus: validated.polarSubscriptionStatus || null,
      },
    })

    logger.info('Service entitlement updated:', auth.userId, validated.service)

    return jsonResponse({ entitlement }, 200, request.headers.get('origin'))
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Service update validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Update service access error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}