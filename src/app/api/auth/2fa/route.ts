import { NextRequest } from 'next/server'
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const toggle2FASchema = z.object({
  enable: z.boolean(),
  verificationCode: z.string().optional(),
  secret: z.string().optional(),
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
    const validated = toggle2FASchema.parse(body)

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404, request.headers.get('origin'))
    }

    if (validated.enable) {
      if (validated.verificationCode && validated.secret) {
        const verified = speakeasy.totp.verify({
          secret: validated.secret,
          encoding: 'base32',
          token: validated.verificationCode,
          window: 2,
        })

        if (!verified) {
          return errorResponse('Invalid verification code', 400, request.headers.get('origin'))
        }

        await prisma.user.update({
          where: { id: auth.userId },
          data: {
            twoFactorEnabled: true,
            twoFactorSecret: validated.secret,
          },
        })

        await createAuditLog(auth.userId, 'TWO_FACTOR_ENABLE', {})

        return jsonResponse(
          {
            message: '2FA enabled successfully',
            twoFactorEnabled: true,
          },
          200,
          request.headers.get('origin')
        )
      } else {
        const generatedSecret = speakeasy.generateSecret({
          name: `Nullpass (${user.email})`,
          issuer: 'Nullpass',
          length: 32,
        })
        const secret = generatedSecret.base32

        const otpauthUrl = speakeasy.otpauthURL({
          secret: secret,
          label: user.email,
          issuer: 'Nullpass',
          encoding: 'base32',
        })

        const qrCodeUrl = await QRCode.toDataURL(otpauthUrl)

        return jsonResponse(
          {
            qrCode: qrCodeUrl,
            secret: secret,
            manualEntryKey: secret,
            message: 'Scan the QR code with your authenticator app',
          },
          200,
          request.headers.get('origin')
        )
      }
    } else {
      if (!validated.verificationCode) {
        return errorResponse('2FA verification code is required to disable 2FA', 400, request.headers.get('origin'))
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return errorResponse('2FA is not enabled', 400, request.headers.get('origin'))
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: validated.verificationCode,
        window: 2,
      })

      if (!verified) {
        return errorResponse('Invalid verification code', 400, request.headers.get('origin'))
      }

      await prisma.user.update({
        where: { id: auth.userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      })

      await createAuditLog(auth.userId, 'TWO_FACTOR_DISABLE', {})

      return jsonResponse(
        {
          message: '2FA disabled successfully',
          twoFactorEnabled: false,
        },
        200,
        request.headers.get('origin')
      )
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('2FA toggle validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('2FA toggle error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}