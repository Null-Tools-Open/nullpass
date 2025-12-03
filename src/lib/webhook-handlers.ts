import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendDiscordWebhook, notifyPaymentSuccess, getEventEmbed } from '@/lib/discord'
import { createAuditLog } from '@/lib/audit'

type ServiceIdentifier = 'DROP' | 'MAILS' | 'VAULT' | 'DB'

export async function handlePolarWebhook(
  payload: any,
  service: ServiceIdentifier
) {
  try {
    try {
      const embed = getEventEmbed(payload.type, payload.data)
      await sendDiscordWebhook({ embeds: [embed] })
    } catch (webhookError) {
      logger.error('Failed to send webhook notification:', webhookError)
    }

    switch (payload.type) {
      case 'checkout.updated': {
        const checkout = payload.data as any
        if (checkout.status === 'succeeded' && checkout.metadata?.userId) {
        }
        break
      }

      case 'subscription.created': {
        const subscription = payload.data as any
        const userId = subscription.metadata?.userId
        if (userId && typeof userId === 'string') {
          await updateUserSubscription(userId, subscription, service)
          await createAuditLog(userId, 'SUBSCRIPTION_CREATE', {
            service,
            plan: subscription.metadata?.plan || 'unknown',
            subscriptionId: subscription.id,
          })
          
          if (subscription.status === 'active') {
            const user = await prisma.user.findUnique({ 
              where: { id: userId }, 
              select: { id: true, email: true } 
            })
            if (user) {
              await notifyPaymentSuccess({
                userId: user.id,
                userEmail: user.email,
                userName: null,
                plan: subscription.metadata?.plan || 'unknown',
                amount: (subscription.amount || 0) / 100,
                currency: subscription.currency || 'usd',
                subscriptionId: subscription.id,
                billingCycle: subscription.metadata?.billingCycle || 'monthly'
              })
            }
          }
        }
        break
      }

      case 'subscription.updated':
      case 'subscription.active': {
        const subscription = payload.data as any
        const userId = subscription.metadata?.userId
        if (userId && typeof userId === 'string') {
          await updateUserSubscription(userId, subscription, service)
          await createAuditLog(userId, 'SUBSCRIPTION_UPDATE', {
            service,
            plan: subscription.metadata?.plan || 'unknown',
            status: subscription.status,
            subscriptionId: subscription.id,
          })
        }
        break
      }

      case 'subscription.canceled':
      case 'subscription.revoked': {
        const subscription = payload.data as any
        const userId = subscription.metadata?.userId
        if (userId && typeof userId === 'string') {
          await cancelUserSubscription(userId, service)
          await createAuditLog(userId, 'SUBSCRIPTION_CANCEL', {
            service,
            subscriptionId: subscription.id,
          })
        }
        break
      }

      case 'customer.created':
      case 'customer.updated': {
        const customer = payload.data as any
        let userId = customer.metadata?.userId
        
        if (!userId && customer.email) {
          const user = await prisma.user.findUnique({
            where: { email: customer.email },
            select: { id: true }
          })
          userId = user?.id
        }
        
        if (userId && typeof userId === 'string') {
          await prisma.userServiceEntitlement.upsert({
            where: {
              userId_service: {
                userId,
                service,
              },
            },
            update: {
              polarCustomerId: customer.id,
              updatedAt: new Date(),
            },
            create: {
              userId,
              service,
              tier: 'free',
              isPremium: false,
              polarCustomerId: customer.id,
            },
          })
        }
        break
      }

      case 'customer.deleted': {
        const customer = payload.data as any
        await handleCustomerDeletion(customer.id, service)
        break
      }

      default:
    }
  } catch (error) {
    logger.error(`Error handling Polar webhook for ${service}:`, error)
  }
}

async function updateUserSubscription(userId: string, subscription: any, service: ServiceIdentifier) {
  try {
    const plan = subscription.metadata?.plan || 'free'
    const isActive = subscription.status === 'active'
    const premiumTier = isActive ? plan : 'free'
    
    await prisma.userServiceEntitlement.upsert({
      where: {
        userId_service: {
          userId,
          service,
        },
      },
      update: {
        polarCustomerId: subscription.customer_id,
        polarSubscriptionId: subscription.id,
        polarSubscriptionStatus: subscription.status,
        isPremium: isActive,
        tier: premiumTier,
        updatedAt: new Date(),
      },
      create: {
        userId,
        service,
        tier: premiumTier,
        isPremium: isActive,
        polarCustomerId: subscription.customer_id,
        polarSubscriptionId: subscription.id,
        polarSubscriptionStatus: subscription.status,
      },
    })

    logger.info('User subscription updated:', userId, service)
  } catch (error) {
    logger.error('Failed to update user subscription:', error)
  }
}

async function cancelUserSubscription(userId: string, service: ServiceIdentifier) {
  try {
    await prisma.userServiceEntitlement.updateMany({
      where: {
        userId,
        service,
      },
      data: {
        polarSubscriptionId: null,
        polarSubscriptionStatus: 'canceled',
        isPremium: false,
        tier: 'free',
        updatedAt: new Date(),
      },
    })

    logger.info('User subscription canceled:', userId, service)
  } catch (error) {
    logger.error('Failed to cancel user subscription:', error)
  }
}

async function handleCustomerDeletion(polarCustomerId: string, service: ServiceIdentifier) {
  try {
    const entitlements = await prisma.userServiceEntitlement.findMany({
      where: { 
        polarCustomerId,
        service,
      },
    })

    for (const entitlement of entitlements) {
      await prisma.userServiceEntitlement.update({
        where: { id: entitlement.id },
        data: {
          polarCustomerId: null,
          polarSubscriptionId: null,
          polarSubscriptionStatus: 'canceled',
          isPremium: false,
          tier: 'free',
          updatedAt: new Date(),
        },
      })
    }

    logger.info('Customer deletion handled:', polarCustomerId, service)
  } catch (error) {
    logger.error('Failed to handle customer deletion:', error)
  }
}