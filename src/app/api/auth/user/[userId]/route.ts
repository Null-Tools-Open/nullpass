import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { logger } from '@/lib/logger'

const INTERNAL_SECRET = process.env.INTERNAL_SECRET

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const internalSecret = request.headers.get('x-internal-secret')
  
  if (!INTERNAL_SECRET || internalSecret !== INTERNAL_SECRET) {
    return errorResponse('Unauthorized', 401, request.headers.get('origin'))
  }

  try {
    const { userId } = await params
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        serviceAccess: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404, request.headers.get('origin'))
    }

    return jsonResponse({ user }, 200, request.headers.get('origin'))
  } catch (error) {
    logger.error('Get user by ID error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}