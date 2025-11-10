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
        register: '/api/auth/register',
        login: '/api/auth/login',
        me: '/api/auth/me',
        verify: '/api/auth/verify',
        sessions: '/api/auth/sessions',
        services: '/api/services',
        health: '/api/health',
      },
    },
    200,
    request.headers.get('origin')
  )
}