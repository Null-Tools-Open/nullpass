import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']

export function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export function handleCors(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return NextResponse.json({}, { headers: corsHeaders(request.headers.get('origin')) })
  }
  return null
}

export function jsonResponse(data: any, status: number = 200, origin: string | null = null) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(origin),
  })
}

export function errorResponse(message: string, status: number = 400, origin: string | null = null) {
  return jsonResponse({ error: message }, status, origin)
}