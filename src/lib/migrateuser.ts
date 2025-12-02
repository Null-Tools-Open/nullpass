import bcrypt from 'bcrypt'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const migrateUserSchema = z.object({
  id: z.string().optional(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  name: z.string().optional(),
  avatar: z.string().optional(),
  isPremium: z.boolean().optional().default(false),
  isPremiumDrop: z.boolean().optional().default(false),
  isPremiumMails: z.boolean().optional().default(false),
  isPremiumVault: z.boolean().optional().default(false),
  isPremiumDB: z.boolean().optional().default(false),
  premiumTierDrop: z.string().optional().default('free'),
  premiumTierMails: z.string().optional().default('free'),
  premiumTierVault: z.string().optional().default('free'),
  premiumTierDB: z.string().optional().default('free'),
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

export type MigrateUserData = z.infer<typeof migrateUserSchema>

export async function migrateUser(data: MigrateUserData): Promise<{ success: boolean; userId: string; email: string; message: string }> {
  logger.ups('Migration attempt for user:', data.email)

  let existingUser = null
  if (data.id) {
    existingUser = await prisma.user.findUnique({
      where: { id: data.id },
    })
  }
  
  if (!existingUser) {
    existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })
  }

  if (existingUser) {
    if (existingUser.migraited) {
      logger.warn('User already migrated:', data.email)
      return {
        success: false,
        userId: existingUser.id,
        email: existingUser.email,
        message: 'User already migrated',
      }
    }
    logger.info('Updating existing user during migration:', data.email)

    let passwordHash: string
    if (data.password.startsWith('$2b$')) {
      passwordHash = data.password
      logger.info('Using existing hashed password for user:', data.email)
    } else {
      logger.info('Hashing new password for user:', data.email)
      passwordHash = await bcrypt.hash(data.password, 10)
      logger.info('Password hashed successfully for user:', data.email)
    }

    logger.info('Attempting to update user in database:', existingUser.id)
    const user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        displayName: data.name,
        avatar: data.avatar,
        twoFactorEnabled: data.twoFactorEnabled,
        twoFactorSecret: data.twoFactorSecret,
        migraited: true,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
      },
    })
    logger.info('User updated successfully in database:', user.id, user.email)

    logger.info('Calling migrateServiceEntitlements for updated user:', user.id)
    await migrateServiceEntitlements(user.id, data)
    logger.info('migrateServiceEntitlements completed for updated user:', user.id)

    logger.info('User migrated (updated):', user.id, user.email)

    return {
      success: true,
      userId: user.id,
      email: user.email,
      message: 'User migrated successfully',
    }
  }

  let passwordHash: string
  if (data.password.startsWith('$2b$')) {
    passwordHash = data.password
    logger.info('Using existing hashed password for new user:', data.email)
  } else {
    logger.info('Hashing new password for new user:', data.email)
    passwordHash = await bcrypt.hash(data.password, 10)
    logger.info('Password hashed successfully for new user:', data.email)
  }

  logger.info('Attempting to create new user in database:', data.email)
  const user = await prisma.user.create({
    data: {
      id: data.id,
      email: data.email,
      passwordHash,
      displayName: data.name,
      avatar: data.avatar,
      twoFactorEnabled: data.twoFactorEnabled,
      twoFactorSecret: data.twoFactorSecret,
      migraited: true,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  })
  logger.info('New user created successfully in database:', user.id, user.email)

  logger.info('Calling migrateServiceEntitlements for new user:', user.id)
  await migrateServiceEntitlements(user.id, data)
  logger.info('migrateServiceEntitlements completed for new user:', user.id)

  logger.info('User migrated (created):', user.id, user.email)

  return {
    success: true,
    userId: user.id,
    email: user.email,
    message: 'User migrated successfully',
  }
}

async function migrateServiceEntitlements(
  userId: string,
  data: MigrateUserData
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

  logger.info('Upserting DROP service entitlement for userId:', userId)
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
  logger.info('DROP service entitlement upserted for userId:', userId)

  if (data.isPremiumMails || data.isPremium) {
    logger.info('Upserting MAILS service entitlement for userId:', userId)
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
    logger.info('MAILS service entitlement upserted for userId:', userId)
  }

  if (data.isPremiumVault || data.isPremium) {
    logger.info('Upserting VAULT service entitlement for userId:', userId)
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
    logger.info('VAULT service entitlement upserted for userId:', userId)
  }

  if (data.isPremiumDB || data.isPremium) {
    logger.info('Upserting DB service entitlement for userId:', userId)
    await prisma.userServiceEntitlement.upsert({
      where: {
        userId_service: {
          userId,
          service: 'DB',
        },
      },
      create: {
        userId,
        service: 'DB',
        tier: data.premiumTierDB || 'free',
        isPremium: data.isPremiumDB || data.isPremium || false
      },
      update: {
        tier: data.premiumTierDB || 'free',
        isPremium: data.isPremiumDB || data.isPremium || false
      },
    })
    logger.info('DB service entitlement upserted for userId:', userId)
  }
}