import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/arcjet', () => ({
  protectRoute: vi.fn().mockResolvedValue(null),
  validateEmailWithArcjet: vi.fn().mockResolvedValue(null),
}))

import { POST } from '@/app/api/auth/register/route'

describe('Register endpoint', () => {
  beforeEach(async () => {
    await prisma.session.deleteMany()
    await prisma.userServiceEntitlement.deleteMany()
    await prisma.user.deleteMany()
  })

  it('should register a new user', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123!',
        displayName: 'Test User',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    if (response.status !== 201) {
      console.error('Response error:', JSON.stringify(data, null, 2))
      console.error('Response status:', response.status)
      if (data.error) {
        console.error('Error message:', data.error)
      }
    }

    expect(response.status).toBe(201)
    expect(data.user).toBeDefined()
    expect(data.user.email).toBe('test@example.com')
    expect(data.user.displayName).toBe('Test User')
    expect(data.token).toBeDefined()

    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
    })
    expect(user).not.toBeNull()
    expect(user?.email).toBe('test@example.com')
  })

  it('should reject duplicate email', async () => {
    await prisma.user.create({
      data: {
        email: 'existing@example.com',
        passwordHash: 'hash',
      },
    })

    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'existing@example.com',
        password: 'TestPassword123!',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toBe('User already exists')
  })

  it('should reject invalid email', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'invalid-email',
        password: 'TestPassword123!',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it('should reject weak password', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: '123',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
  })
})