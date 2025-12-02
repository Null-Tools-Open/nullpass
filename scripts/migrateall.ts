import 'dotenv/config'
import { getDropDbPool, prisma } from '../src/lib/prisma'
import { migrateUser, type MigrateUserData } from '../src/lib/migrateuser'
import { logger } from '../src/lib/logger'

interface DropUser {
  id: string
  email: string
  password: string
  name: string | null
  avatar: string | null
  isPremium: boolean
  isPremiumDrop: boolean
  isPremiumMails: boolean
  isPremiumVault: boolean
  premiumTierDrop: string
  premiumTierMails: string
  premiumTierVault: string
  twoFactorEnabled: boolean
  twoFactorSecret: string | null
  customStorageLimit: number | null
  customApiKeyLimit: number | null
  isNullDropTeam: boolean
  accessFilesPreview: boolean
  accessFilesDownload: boolean
  nullDropTeamRole: string
  customDomain: string | null
  customDomainVerified: boolean
  polarCustomerId: string | null
  polarSubscriptionId: string | null
  polarSubscriptionStatus: string | null
  createdAt: Date
}

async function main() {
  logger.info('Starting migration of all users from nulldrop to nullpass...')

  if (!process.env.DROP_DATABASE_URL) {
    logger.error('DROP_DATABASE_URL is not set in environment variables')
    process.exit(1)
  }

  const dropPool = getDropDbPool()

  try {
    logger.info('Fetching users from nulldrop database...')
    let hasMigraitedColumn = false
    try {
      const columnCheck = await dropPool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'migraited'
      `)
      hasMigraitedColumn = columnCheck.rows.length > 0
    } catch (error) {
      logger.warn('Could not check for migraited column in nulldrop:', error)
    }

    const dropUsersResult = await dropPool.query<DropUser>(`
      SELECT 
        id,
        email,
        password,
        name,
        avatar,
        "isPremium",
        "isPremiumDrop",
        "isPremiumMails",
        "isPremiumVault",
        "premiumTierDrop",
        "premiumTierMails",
        "premiumTierVault",
        "twoFactorEnabled",
        "twoFactorSecret",
        "customStorageLimit",
        "customApiKeyLimit",
        "isNullDropTeam",
        "accessFilesPreview",
        "accessFilesDownload",
        "nullDropTeamRole",
        "customDomain",
        "customDomainVerified",
        "polarCustomerId",
        "polarSubscriptionId",
        "polarSubscriptionStatus",
        "createdAt"
      FROM users
      ${hasMigraitedColumn ? 'WHERE migraited = false OR migraited IS NULL' : ''}
      ORDER BY "createdAt" ASC
    `)

    const dropUsers = dropUsersResult.rows
    logger.info(`Found ${dropUsers.length} users in nulldrop database`)

    logger.info('Checking which users are already migrated...')
    const migratedUsers = await prisma.user.findMany({
      where: { migraited: true },
      select: { id: true, email: true },
    })
    const migratedEmails = new Set(migratedUsers.map(u => u.email))
    const migratedIds = new Set(migratedUsers.map(u => u.id))

    logger.info(`Found ${migratedUsers.length} already migrated users in nullpass`)

    if (migratedUsers.length > 0 && hasMigraitedColumn) {
      logger.info('Updating migraited flag in nulldrop for already migrated users...')
      let updatedCount = 0
      for (const user of migratedUsers) {
        try {
          await dropPool.query(
            `UPDATE users SET migraited = true WHERE id = $1 OR email = $2`,
            [user.id, user.email]
          )
          updatedCount++
        } catch (error: any) {
          logger.warn(`Could not update migraited flag for ${user.email}:`, error.message)
        }
      }
      logger.info(`Updated migraited flag for ${updatedCount} users in nulldrop`)
    }

    const usersToMigrate = dropUsers.filter(
      user => !migratedEmails.has(user.email) && !migratedIds.has(user.id)
    )

    logger.info(`Found ${usersToMigrate.length} users to migrate`)

    if (usersToMigrate.length === 0) {
      logger.info('No users to migrate. All done!')
      await dropPool.end()
      await prisma.$disconnect()
      process.exit(0)
    }

    let successCount = 0
    let errorCount = 0
    const errors: Array<{ email: string; error: string }> = []

    for (let i = 0; i < usersToMigrate.length; i++) {
      const dropUser = usersToMigrate[i]
      logger.info(`[${i + 1}/${usersToMigrate.length}] Migrating user: ${dropUser.email}`)

      try {
        const migrateData: MigrateUserData = {
          id: dropUser.id,
          email: dropUser.email,
          password: dropUser.password || '',
          name: dropUser.name || undefined,
          avatar: dropUser.avatar || undefined,
          isPremium: dropUser.isPremium,
          isPremiumDrop: dropUser.isPremiumDrop,
          isPremiumMails: dropUser.isPremiumMails,
          isPremiumVault: dropUser.isPremiumVault,
          isPremiumDB: false,
          premiumTierDrop: dropUser.premiumTierDrop || 'free',
          premiumTierMails: dropUser.premiumTierMails || 'free',
          premiumTierVault: dropUser.premiumTierVault || 'free',
          premiumTierDB: 'free',
          twoFactorEnabled: dropUser.twoFactorEnabled,
          twoFactorSecret: dropUser.twoFactorSecret || undefined,
          customStorageLimit: dropUser.customStorageLimit || undefined,
          customApiKeyLimit: dropUser.customApiKeyLimit || undefined,
          isNullDropTeam: dropUser.isNullDropTeam,
          accessFilesPreview: dropUser.accessFilesPreview,
          accessFilesDownload: dropUser.accessFilesDownload,
          nullDropTeamRole: dropUser.nullDropTeamRole || 'member',
          customDomain: dropUser.customDomain || undefined,
          customDomainVerified: dropUser.customDomainVerified,
          polarCustomerId: dropUser.polarCustomerId || undefined,
          polarSubscriptionId: dropUser.polarSubscriptionId || undefined,
          polarSubscriptionStatus: dropUser.polarSubscriptionStatus || undefined,
          createdAt: dropUser.createdAt.toISOString(),
        }

        const result = await migrateUser(migrateData)

        if (result.success) {
          try {
            await dropPool.query(
              `UPDATE users SET migraited = true WHERE id = $1`,
              [dropUser.id]
            )
            logger.info(`Marked as migraited in nulldrop: ${dropUser.email}`)
          } catch (updateError: any) {
            logger.warn(`Could not update migraited flag in nulldrop for ${dropUser.email}:`, updateError.message)
          }
          
          successCount++
          logger.info(`Successfully migrated: ${dropUser.email}`)
        } else {
          errorCount++
          errors.push({ email: dropUser.email, error: result.message })
          logger.warn(`Failed to migrate: ${dropUser.email} - ${result.message}`)
        }
      } catch (error: any) {
        errorCount++
        const errorMessage = error.message || 'Unknown error'
        errors.push({ email: dropUser.email, error: errorMessage })
        logger.error(`Error migrating ${dropUser.email}:`, errorMessage)
      }
        
      if (i < usersToMigrate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    logger.info('\n=== Migration Summary ===')
    logger.info(`Total users in nulldrop: ${dropUsers.length}`)
    logger.info(`Already migrated: ${migratedUsers.length}`)
    logger.info(`Users to migrate: ${usersToMigrate.length}`)
    logger.info(`Successfully migrated: ${successCount}`)
    logger.info(`Failed: ${errorCount}`)

    if (errors.length > 0) {
      logger.warn('\n=== Errors ===')
      errors.forEach(({ email, error }) => {
        logger.warn(`${email}: ${error}`)
      })
    }

    logger.info('\nMigration completed!')
  } catch (error: any) {
    logger.error('Fatal error during migration:', error)
    process.exit(1)
  } finally {
    await dropPool.end()
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    logger.error('Unhandled error:', error)
    process.exit(1)
})