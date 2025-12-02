import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

let dropDbPool: Pool | null = null

export function getDropDbPool(): Pool {
  if (!process.env.DROP_DATABASE_URL) {
    throw new Error('DROP_DATABASE_URL is not set')
  }

  if (!dropDbPool) {
    dropDbPool = new Pool({
      connectionString: process.env.DROP_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  }

  return dropDbPool
}