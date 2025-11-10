import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import { prisma } from '@/lib/prisma'
import { loginSchema } from '@/lib/validations'
import { generateToken } from '@/lib/auth'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { getSessionExpiresAt } from '@/lib/session'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'

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

    const token = generateToken({ userId: user.id, email: user.email })
    const expiresAt = getSessionExpiresAt()

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    })

    logger.info('User logged in:', user.id, user.email)

    return jsonResponse(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
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