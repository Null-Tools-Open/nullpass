import { NextRequest } from 'next/server'
import { handleCors } from '@/lib/response'

export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new Response(null, { status: 200 })
}