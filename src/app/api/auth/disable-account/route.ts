import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import speakeasy from 'speakeasy'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const disableAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  verificationCode: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request, { requested: 2 })
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const validated = disableAccountSchema.parse(body)

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        serviceAccess: true,
      },
    })

    if (!user || !user.passwordHash) {
      return errorResponse('User not found', 404, request.headers.get('origin'))
    }

    const isValid = await bcrypt.compare(validated.password, user.passwordHash)
    if (!isValid) {
      logger.warn('Account disable failed: Invalid password', auth.userId)
      return errorResponse('Invalid password', 401, request.headers.get('origin'))
    }

    if (user.twoFactorEnabled) {
      if (!validated.verificationCode) {
        return errorResponse('2FA verification code is required', 401, request.headers.get('origin'))
      }

      if (!user.twoFactorSecret) {
        return errorResponse('2FA is enabled but secret is missing', 500, request.headers.get('origin'))
      }

      const isValid2FA = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: validated.verificationCode,
        window: 2,
      })

      if (!isValid2FA) {
        logger.warn('Account disable failed: Invalid 2FA code', auth.userId)
        return errorResponse('Invalid 2FA verification code', 401, request.headers.get('origin'))
      }
    }

    for (const service of user.serviceAccess) {
      if (service.polarSubscriptionId && process.env.POLAR_ACCESS_TOKEN) {
        try {
          const response = await fetch(`https://api.polar.sh/v1/subscriptions/${service.polarSubscriptionId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          })
          
          if (response.ok) {
            logger.info(`Canceled Polar subscription: ${service.polarSubscriptionId}`, auth.userId)
          } else {
            logger.warn(`Failed to cancel Polar subscription: ${service.polarSubscriptionId}`, response.status)
          }
        } catch (error) {
          logger.error('Failed to cancel Polar subscription:', error)
        }
      }
    }

    await createAuditLog(auth.userId, 'USER_DISABLE', {
      email: user.email,
    })

    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        disabled: true,
      },
    } as any)

    logger.info(`User account disabled: ${user.email}`, auth.userId)

    return jsonResponse(
      { success: true, message: 'Account disabled successfully' },
      200,
      request.headers.get('origin')
    )
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Disable account validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Disable account error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}