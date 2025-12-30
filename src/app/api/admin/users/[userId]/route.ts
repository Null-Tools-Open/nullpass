import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { logger } from '@/lib/logger'
import { requireAuth } from '@/lib/middleware'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const INTERNAL_SECRET = process.env.INTERNAL_SECRET

const updateUserServiceSchema = z.object({
  service: z.enum(['DROP', 'MAILS', 'VAULT', 'DB', 'BOARD']),
  tier: z.string().optional(),
  isPremium: z.boolean().optional(),
  accessFlags: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  customStorageLimit: z.number().optional(),
  customApiKeyLimit: z.number().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const internalSecret = request.headers.get('x-internal-secret')
  const isInternal = INTERNAL_SECRET && internalSecret === INTERNAL_SECRET

  let adminUserId: string | null = null

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

    adminUserId = auth.userId
  }

  try {
    const { userId } = await params
    const body = await request.json()
    const validated = updateUserServiceSchema.parse(body)

    const targetUserService = await prisma.userServiceEntitlement.findFirst({
      where: { userId },
    })

    if (!targetUserService) {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      })

      if (!userExists) {
        return errorResponse('User not found', 404, request.headers.get('origin'))
      }
    }

    const entitlement = await prisma.userServiceEntitlement.upsert({
      where: {
        userId_service: {
          userId: userId,
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
        updatedAt: new Date(),
      },
      create: {
        userId: userId,
        service: validated.service,
        tier: validated.tier || 'free',
        isPremium: validated.isPremium || false,
        accessFlags: validated.accessFlags || undefined,
        metadata: validated.metadata || undefined,
        customStorageLimit: validated.customStorageLimit || null,
        customApiKeyLimit: validated.customApiKeyLimit || null,
      },
    })

    if (adminUserId) {
      await createAuditLog(adminUserId, 'SERVICE_ACCESS_GRANT', {
        targetUserId: userId,
        service: validated.service,
        changes: validated,
      })
    }

    return jsonResponse({ entitlement }, 200, request.headers.get('origin'))
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Update user service validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Update user service error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}