import { NextRequest } from 'next/server'
import { handleCors, jsonResponse } from '@/lib/response'
import { protectRoute } from '@/lib/arcjet'

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request, { requested: 0.5 })
  if (blocked) return blocked

  return jsonResponse(
    {
      service: 'nullpass',
      version: '1.0.0',
      status: 'ok',
    },
    200,
    request.headers.get('origin')
  )
}