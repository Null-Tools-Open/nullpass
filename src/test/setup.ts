import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import { beforeAll, afterAll } from 'vitest'

const prisma = new PrismaClient()

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/nullpass_test?schema=public'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key'
  process.env.JWT_EXPIRES_IN = '7d'
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000'
  process.env.ARCJET_KEY = 'ajkey_test'
  process.env.ARCJET_SHIELD_MODE = 'dry-run'
  process.env.LOG_LEVEL = 'error'
  
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' })
  } catch (error) {
    console.warn('Migration deploy failed, assuming migrations are already applied:', error)
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})