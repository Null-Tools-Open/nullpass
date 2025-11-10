import { describe, it, expect } from 'vitest'
import { generateToken, verifyToken, getTokenFromRequest } from '@/lib/auth'
import { NextRequest } from 'next/server'

describe('Auth utilities', () => {
  it('should generate a valid token', () => {
    const payload = { userId: 'test-user-id', email: 'test@example.com' }
    const token = generateToken(payload)
    
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('should verify a valid token', () => {
    const payload = { userId: 'test-user-id', email: 'test@example.com' }
    const token = generateToken(payload)
    const verified = verifyToken(token)
    
    expect(verified).not.toBeNull()
    expect(verified?.userId).toBe(payload.userId)
    expect(verified?.email).toBe(payload.email)
  })

  it('should return null for invalid token', () => {
    const verified = verifyToken('invalid-token')
    expect(verified).toBeNull()
  })

  it('should extract token from Authorization header', () => {
    const headers = new Headers()
    headers.set('authorization', 'Bearer test-token-123')
    const request = new NextRequest('http://localhost:3000', { headers })
    
    const token = getTokenFromRequest(request)
    expect(token).toBe('test-token-123')
  })

  it('should return null when Authorization header is missing', () => {
    const request = new NextRequest('http://localhost:3000')
    const token = getTokenFromRequest(request)
    expect(token).toBeNull()
  })

  it('should return null when Authorization header does not start with Bearer', () => {
    const headers = new Headers()
    headers.set('authorization', 'Invalid test-token-123')
    const request = new NextRequest('http://localhost:3000', { headers })
    
    const token = getTokenFromRequest(request)
    expect(token).toBeNull()
  })
})