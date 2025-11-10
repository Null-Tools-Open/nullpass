import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { z } from 'zod'

// Thats the most important route in the whole project
// its used to migrate users from nulldrop database to nulpass

const migrateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  name: z.string().optional(),
  isPremium: z.boolean().optional().default(false),
  isPremiumDrop: z.boolean().optional().default(false),
  isPremiumMails: z.boolean().optional().default(false),
  isPremiumVault: z.boolean().optional().default(false),
  premiumTierDrop: z.string().optional().default('free'),
  premiumTierMails: z.string().optional().default('free'),
  premiumTierVault: z.string().optional().default('free'),
  twoFactorEnabled: z.boolean().optional().default(false),
  twoFactorSecret: z.string().optional(),
  customStorageLimit: z.number().optional(),
  customApiKeyLimit: z.number().optional(),
  isNullDropTeam: z.boolean().optional().default(false),
  accessFilesPreview: z.boolean().optional().default(false),
  accessFilesDownload: z.boolean().optional().default(false),
  nullDropTeamRole: z.string().optional().default('member'),
  customDomain: z.string().optional(),
  customDomainVerified: z.boolean().optional().default(false),
  polarCustomerId: z.string().optional(),
  polarSubscriptionId: z.string().optional(),
  polarSubscriptionStatus: z.string().optional(),
  createdAt: z.string().datetime().optional(),
})

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request, { requested: 5 })
  if (blocked) return blocked

  try {
    const body = await request.json()
    const validated = migrateUserSchema.parse(body)

    logger.ups('Migration attempt:', validated.email)

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    })

    if (existingUser) {
      if (existingUser.migraited) {
        logger.warn('User already migrated:', validated.email)
        return errorResponse('User already migrated', 409, request.headers.get('origin'))
      }
      logger.info('Updating existing user during migration:', validated.email)

      const passwordHash = validated.password.startsWith('$2b$')
        ? validated.password
        : await bcrypt.hash(validated.password, 10)

      const user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          displayName: validated.name,
          twoFactorEnabled: validated.twoFactorEnabled,
          twoFactorSecret: validated.twoFactorSecret,
          migraited: true,
          createdAt: validated.createdAt ? new Date(validated.createdAt) : undefined,
        },
      })

      await migrateServiceEntitlements(user.id, validated)

      logger.info('User migrated (updated):', user.id, user.email)

      return jsonResponse(
        {
          success: true,
          userId: user.id,
          email: user.email,
          message: 'User migrated successfully',
        },
        200,
        request.headers.get('origin')
      )
    }

    const passwordHash = validated.password.startsWith('$2b$')
      ? validated.password
      : await bcrypt.hash(validated.password, 10)

    const user = await prisma.user.create({
      data: {
        email: validated.email,
        passwordHash,
        displayName: validated.name,
        twoFactorEnabled: validated.twoFactorEnabled,
        twoFactorSecret: validated.twoFactorSecret,
        migraited: true,
        createdAt: validated.createdAt ? new Date(validated.createdAt) : undefined,
      },
    })

    await migrateServiceEntitlements(user.id, validated)

    logger.info('User migrated (created):', user.id, user.email)

    return jsonResponse(
      {
        success: true,
        userId: user.id,
        email: user.email,
        message: 'User migrated successfully',
      },
      201,
      request.headers.get('origin')
    )
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Migration validation error:', error.errors)
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    logger.error('Migration error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}

async function migrateServiceEntitlements(
  userId: string,
  data: z.infer<typeof migrateUserSchema>
) {
  const dropAccessFlags: Record<string, any> = {}
  if (data.isNullDropTeam) {
    dropAccessFlags.isNullDropTeam = true
    dropAccessFlags.nullDropTeamRole = data.nullDropTeamRole
  }
  if (data.accessFilesPreview) {
    dropAccessFlags.accessFilesPreview = true
  }
  if (data.accessFilesDownload) {
    dropAccessFlags.accessFilesDownload = true
  }

  const dropMetadata: Record<string, any> = {}
  if (data.customDomain) {
    dropMetadata.customDomain = data.customDomain
    dropMetadata.customDomainVerified = data.customDomainVerified
  }

  await prisma.userServiceEntitlement.upsert({
    where: {
      userId_service: {
        userId,
        service: 'DROP',
      },
    },
    create: {
      userId,
      service: 'DROP',
      tier: data.premiumTierDrop || 'free',
      isPremium: data.isPremiumDrop || data.isPremium || false,
      accessFlags: Object.keys(dropAccessFlags).length > 0 ? dropAccessFlags : undefined,
      metadata: Object.keys(dropMetadata).length > 0 ? dropMetadata : undefined,
      customStorageLimit: data.customStorageLimit,
      customApiKeyLimit: data.customApiKeyLimit,
      polarCustomerId: data.polarCustomerId,
      polarSubscriptionId: data.polarSubscriptionId,
      polarSubscriptionStatus: data.polarSubscriptionStatus,
    },
    update: {
      tier: data.premiumTierDrop || 'free',
      isPremium: data.isPremiumDrop || data.isPremium || false,
      accessFlags: Object.keys(dropAccessFlags).length > 0 ? dropAccessFlags : undefined,
      metadata: Object.keys(dropMetadata).length > 0 ? dropMetadata : undefined,
      customStorageLimit: data.customStorageLimit,
      customApiKeyLimit: data.customApiKeyLimit,
      polarCustomerId: data.polarCustomerId,
      polarSubscriptionId: data.polarSubscriptionId,
      polarSubscriptionStatus: data.polarSubscriptionStatus,
    },
  })

  if (data.isPremiumMails || data.isPremium) {
    await prisma.userServiceEntitlement.upsert({
      where: {
        userId_service: {
          userId,
          service: 'MAILS',
        },
      },
      create: {
        userId,
        service: 'MAILS',
        tier: data.premiumTierMails || 'free',
        isPremium: data.isPremiumMails || data.isPremium || false,
      },
      update: {
        tier: data.premiumTierMails || 'free',
        isPremium: data.isPremiumMails || data.isPremium || false,
      },
    })
  }

  if (data.isPremiumVault || data.isPremium) {
    await prisma.userServiceEntitlement.upsert({
      where: {
        userId_service: {
          userId,
          service: 'VAULT',
        },
      },
      create: {
        userId,
        service: 'VAULT',
        tier: data.premiumTierVault || 'free',
        isPremium: data.isPremiumVault || data.isPremium || false,
      },
      update: {
        tier: data.premiumTierVault || 'free',
        isPremium: data.isPremiumVault || data.isPremium || false,
      },
    })
  }
}