import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'

vi.mock('@/lib/arcjet', () => ({
  protectRoute: vi.fn().mockResolvedValue(null),
  validateEmailWithArcjet: vi.fn().mockResolvedValue(null),
}))

import { POST } from '@/app/api/auth/login/route'

describe('Login endpoint', () => {
  beforeEach(async () => {
    await prisma.session.deleteMany()
    await prisma.userServiceEntitlement.deleteMany()
    await prisma.user.deleteMany()
  })

  it('should login with valid credentials', async () => {
    const passwordHash = await bcrypt.hash('TestPassword123!', 10)
    await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
      },
    })

    const userBeforeLogin = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
    })
    expect(userBeforeLogin).not.toBeNull()

    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123!',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    if (response.status !== 200) {
      console.error('Response error:', JSON.stringify(data, null, 2))
      console.error('Response status:', response.status)
      console.error('User exists:', !!userBeforeLogin)
      console.error('Password hash matches:', userBeforeLogin?.passwordHash === passwordHash)
    }

    expect(response.status).toBe(200)
    expect(data.user).toBeDefined()
    expect(data.user.email).toBe('test@example.com')
    expect(data.token).toBeDefined()
    expect(data.services).toBeDefined()
  })

  it('should reject invalid email', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'TestPassword123!',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Invalid credentials')
  })

  it('should reject invalid password', async () => {
    const passwordHash = await bcrypt.hash('TestPassword123!', 10)
    await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash,
      },
    })

    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'WrongPassword123!',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Invalid credentials')
  })

  it('should reject user without password', async () => {
    await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: null,
      },
    })

    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123!',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Invalid credentials')
  })
})