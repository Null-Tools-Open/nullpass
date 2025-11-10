import { NextRequest } from 'next/server'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import { verifyTokenSchema } from '@/lib/validations'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { protectRoute } from '@/lib/arcjet'

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  try {
    const body = await request.json()
    const validated = verifyTokenSchema.parse(body)

    const payload = verifyToken(validated.token)
    if (!payload) {
      return errorResponse('Invalid token', 401, request.headers.get('origin'))
    }

    return jsonResponse(
      {
        valid: true,
        payload,
      },
      200,
      request.headers.get('origin')
    )
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    return errorResponse('Invalid token', 401, request.headers.get('origin'))
  }
}