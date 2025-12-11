import { NextRequest } from 'next/server'
import { handleCors, jsonResponse } from '@/lib/response'
import { protectRoute } from '@/lib/arcjet'

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  return jsonResponse(
    {
      message: 'NullPass Auth API',
      version: '1.0.0',
      endpoints: {
        auth: {
          register: 'POST /api/auth/register',
          login: 'POST /api/auth/login',
          me: 'GET /api/auth/me',
          updateProfile: 'PATCH /api/auth/me',
          changePassword: 'POST /api/auth/password',
          verify: 'POST /api/auth/verify',
          sessions: 'GET /api/auth/sessions',
          deleteSession: 'DELETE /api/auth/sessions?id=sessionId',
        },
        services: {
          list: 'GET /api/services?service=DROP',
          update: 'POST /api/services',
        },
        connect: {
          check: 'GET /api/connect/check?service=DROP',
          connect: 'POST /api/connect/connect',
          disconnect: 'POST /api/connect/disconnect',
        },
        health: 'GET /api/health',
      },
    },
    200,
    request.headers.get('origin')
  )
}