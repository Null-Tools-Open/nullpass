import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import speakeasy from 'speakeasy'
import { prisma } from '@/lib/prisma'
import { loginSchema } from '@/lib/validations'
import { generateToken } from '@/lib/auth'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { getSessionExpiresAt } from '@/lib/session'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { createAuditLog } from '@/lib/audit'
import { getClientIp } from '@/lib/ip-utils'

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request, { requested: 2 })
  if (blocked) return blocked

  try {
    const body = await request.json()
    const validated = loginSchema.parse(body)

    logger.ups('Login attempt:', validated.email)

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
      include: {
        serviceAccess: true,
      },
    })

    if (!user || !user.passwordHash) {
      logger.warn('Login failed: Invalid credentials', validated.email)
      return errorResponse('Invalid credentials', 401, request.headers.get('origin'))
    }

    const isValid = await bcrypt.compare(validated.password, user.passwordHash)
    if (!isValid) {
      logger.warn('Login failed: Invalid password', validated.email)
      return errorResponse('Invalid credentials', 401, request.headers.get('origin'))
    }

    const verificationCode = validated.verificationCode

    if (user.twoFactorEnabled) {
      if (!verificationCode) {
        const pendingToken = generateToken({ userId: user.id, email: user.email })
        return jsonResponse(
          {
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              avatar: user.avatar,
            },
            requires2FA: true,
            pendingToken,
            message: '2FA verification required',
          },
          200,
          request.headers.get('origin')
        )
      }

      if (!user.twoFactorSecret) {
        logger.warn('2FA enabled but no secret found', user.id)
        return errorResponse('2FA configuration error', 500, request.headers.get('origin'))
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: verificationCode,
        window: 2,
      })

      if (!verified) {
        logger.warn('2FA verification failed', user.id)
        return errorResponse('Invalid 2FA verification code', 401, request.headers.get('origin'))
      }
    }

    const clientIp = getClientIp(request)

    const existingSession = await prisma.session.findFirst({
      where: {
        userId: user.id,
        ip: clientIp,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    let token: string
    const expiresAt = getSessionExpiresAt()

    let sessionCreated = false
    
    if (existingSession) {
      const { verifyToken } = await import('@/lib/auth')
      const tokenPayload = verifyToken(existingSession.token)
      
      if (tokenPayload && tokenPayload.userId === user.id) {
        token = existingSession.token
        await prisma.session.update({
          where: { id: existingSession.id },
          data: {
            expiresAt,
          },
        })
      } else {
        token = generateToken({ userId: user.id, email: user.email })
        await prisma.session.update({
          where: { id: existingSession.id },
          data: {
            token,
            expiresAt,
          },
        })
      }
    } else {
      token = generateToken({ userId: user.id, email: user.email })
      await prisma.session.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
          ip: clientIp,
        },
      })
      sessionCreated = true
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    })

    await createAuditLog(user.id, 'USER_LOGIN', {
      ip: clientIp,
      twoFactorUsed: user.twoFactorEnabled && !!verificationCode,
    })
    
    if (sessionCreated) {
      await createAuditLog(user.id, 'SESSION_CREATE', {
        ip: clientIp,
      })
    }

    return jsonResponse(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatar: user.avatar,
        },
        token,
        services: user.serviceAccess,
      },
      200,
      request.headers.get('origin')
    )
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Login validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Login error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}