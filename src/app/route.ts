import { NextRequest } from 'next/server'
import { handleCors, jsonResponse } from '@/lib/response'

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  return jsonResponse(
    {
      service: 'nullpass',
      version: '1.0.0',
      type: 'API only',
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