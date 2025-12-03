import jwt from 'jsonwebtoken'
import type { NextRequest } from 'next/server'
import { logger } from './logger'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export interface TokenPayload {
  userId: string
  email: string
}

export function generateToken(payload: TokenPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  const now = Math.floor(Date.now() / 1000)
  const serverTime = new Date().toISOString()
  
  let expiresInSeconds: number = 7 * 24 * 60 * 60
  if (typeof expiresIn === 'string') {
    const match = expiresIn.match(/^(\d+)([smhd])$/)
    if (match) {
      const value = parseInt(match[1])
      const unit = match[2]
      switch (unit) {
        case 's': expiresInSeconds = value; break
        case 'm': expiresInSeconds = value * 60; break
        case 'h': expiresInSeconds = value * 60 * 60; break
        case 'd': expiresInSeconds = value * 24 * 60 * 60; break
      }
    }
  }
  
  const exp = now + expiresInSeconds
  
  const tokenPayload = {
    ...payload,
    exp: exp,
    iat: now,
  }
  
  const token = jwt.sign(tokenPayload, JWT_SECRET)
  return token
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
    return decoded
  } catch (error: any) {
    return null
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  return null
}

export function getUserIdFromRequest(request: NextRequest): string | null {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = verifyToken(token)
  return payload?.userId || null
}