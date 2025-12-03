import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().optional(),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  verificationCode: z.string().optional(),
})

export const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>

export { validateEmailWithArcjet } from './arcjet'