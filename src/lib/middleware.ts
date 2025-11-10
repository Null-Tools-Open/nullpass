import { NextRequest } from 'next/server'
import { getUserIdFromRequest } from '@/lib/auth'
import { errorResponse } from '@/lib/response'

export async function requireAuth(request: NextRequest) {
  const userId = getUserIdFromRequest(request)
  if (!userId) {
    return { error: errorResponse('Unauthorized', 401, request.headers.get('origin')) }
  }
  return { userId }
}