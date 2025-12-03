import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import { prisma } from '@/lib/prisma'
import { registerSchema, validateEmailWithArcjet } from '@/lib/validations'
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
    const validated = registerSchema.parse(body)

    logger.ups('Register attempt:', validated.email)

    const emailValidation = await validateEmailWithArcjet(request, validated.email)
    if (emailValidation) return emailValidation

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    })

    if (existingUser) {
      logger.warn('Register failed: User already exists', validated.email)
      return errorResponse('User already exists', 409, request.headers.get('origin'))
    }

    const passwordHash = await bcrypt.hash(validated.password, 10)

    const user = await prisma.user.create({
      data: {
        email: validated.email,
        passwordHash,
        displayName: validated.displayName,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
      },
    })

    const clientIp = getClientIp(request)

    const token = generateToken({ userId: user.id, email: user.email })
    const expiresAt = getSessionExpiresAt()

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        ip: clientIp,
      },
    })

    await createAuditLog(user.id, 'USER_REGISTER', {
      email: user.email,
      ip: clientIp,
    })
    await createAuditLog(user.id, 'SESSION_CREATE', {
      ip: clientIp,
    })

    return jsonResponse(
      {
        user,
        token,
      },
      201,
      request.headers.get('origin')
    )
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Register validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Register error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}