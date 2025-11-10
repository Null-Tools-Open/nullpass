import { describe, it, expect } from 'vitest'
import { registerSchema, loginSchema, verifyTokenSchema } from '@/lib/validations'

describe('Validation schemas', () => {
  describe('registerSchema', () => {
    it('should validate correct registration data', () => {
      const data = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        displayName: 'Test User',
      }
      const result = registerSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should validate registration without displayName', () => {
      const data = {
        email: 'test@example.com',
        password: 'TestPassword123!',
      }
      const result = registerSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const data = {
        email: 'invalid-email',
        password: 'TestPassword123!',
      }
      const result = registerSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('should reject short password', () => {
      const data = {
        email: 'test@example.com',
        password: '123',
      }
      const result = registerSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const data = {
        email: 'test@example.com',
        password: 'TestPassword123!',
      }
      const result = loginSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const data = {
        email: 'invalid-email',
        password: 'TestPassword123!',
      }
      const result = loginSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('should reject empty password', () => {
      const data = {
        email: 'test@example.com',
        password: '',
      }
      const result = loginSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('verifyTokenSchema', () => {
    it('should validate correct token data', () => {
      const data = {
        token: 'valid-token-123',
      }
      const result = verifyTokenSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should reject empty token', () => {
      const data = {
        token: '',
      }
      const result = verifyTokenSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })
})