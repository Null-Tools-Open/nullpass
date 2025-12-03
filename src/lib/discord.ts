interface DiscordWebhookEmbed {
  title?: string
  description?: string
  color?: number
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  timestamp?: string
  footer?: {
    text: string
  }
  author?: {
    name: string
    icon_url?: string
  }
}

interface DiscordWebhookPayload {
  embeds?: DiscordWebhookEmbed[]
  content?: string
  username?: string
  avatar_url?: string
}

export async function sendDiscordWebhook(payload: DiscordWebhookPayload): Promise<boolean> {
  const webhookUrl = process.env.WEBHOOK_TICKET
  
  if (!webhookUrl) {
    return false
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return response.ok
  } catch (error) {
    return false
  }
}

export async function notifyPaymentSuccess(data: {
  userId: string
  userEmail: string
  userName?: string | null
  plan: string
  amount: number
  currency: string
  subscriptionId: string
  billingCycle: string
}) {
  const { userId, userEmail, userName, plan, amount, currency, subscriptionId, billingCycle } = data
  
  const embed: DiscordWebhookEmbed = {
    title: 'Payment Successful',
    description: `New premium subscription activated!`,
    color: 0x00FF00,
    fields: [
      {
        name: 'User',
        value: `${userName || userEmail}`,
        inline: true
      },
      {
        name: 'Email',
        value: userEmail,
        inline: true
      },
      {
        name: 'Plan',
        value: plan.toUpperCase(),
        inline: true
      },
      {
        name: 'Amount',
        value: `${amount} ${currency.toUpperCase()}`,
        inline: true
      },
      {
        name: 'Billing Cycle',
        value: billingCycle,
        inline: true
      },
      {
        name: 'Subscription ID',
        value: `\`${subscriptionId}\``,
        inline: false
      },
      {
        name: 'User ID',
        value: `\`${userId}\``,
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'NullPass - Payment System'
    }
  }

  return await sendDiscordWebhook({
    embeds: [embed]
  })
}

function getEventEmbed(eventType: string, data: any): DiscordWebhookEmbed {
  const timestamp = new Date().toISOString()
  
  const getColor = (eventType: string): number => {
    switch (eventType) {
      case 'subscription.created':
      case 'subscription.active':
        return 0x00ff00
      case 'subscription.canceled':
      case 'subscription.revoked':
        return 0xff0000
      case 'customer.created':
        return 0x0099ff
      case 'customer.deleted':
        return 0xff6600
      case 'checkout.updated':
        return data.status === 'succeeded' ? 0x00ff00 : 0xffaa00
      default:
        return 0x666666
    }
  }

  const getTitle = (eventType: string): string => {
    switch (eventType) {
      case 'checkout.updated': return 'Checkout Updated'
      case 'subscription.created': return 'New Subscription'
      case 'subscription.updated': return 'Subscription Updated'
      case 'subscription.active': return 'Subscription Activated'
      case 'subscription.canceled': return 'Subscription Canceled'
      case 'subscription.revoked': return 'Subscription Revoked'
      case 'customer.created': return 'New Customer'
      case 'customer.updated': return 'Customer Updated'
      case 'customer.deleted': return 'Customer Deleted'
      default: return 'Polar Webhook Event'
    }
  }

  const embed: DiscordWebhookEmbed = {
    title: getTitle(eventType),
    color: getColor(eventType),
    timestamp: timestamp,
    fields: []
  }

  switch (eventType) {
    case 'checkout.updated':
      embed.fields = [
        { name: 'Status', value: data.status, inline: true },
        { name: 'Customer', value: data.customerEmail || 'N/A', inline: true },
        { name: 'Amount', value: `${data.amount ? (data.amount / 100).toFixed(2) : '0'} ${data.currency?.toUpperCase() || 'USD'}`, inline: true }
      ]
      break
    
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.active':
    case 'subscription.canceled':
    case 'subscription.revoked':
      embed.fields = [
        { name: 'Plan', value: data.metadata?.plan || 'Unknown', inline: true },
        { name: 'Customer', value: data.customer?.email || 'N/A', inline: true },
        { name: 'Status', value: data.status, inline: true },
        { name: 'Amount', value: `${data.amount ? (data.amount / 100).toFixed(2) : '0'} ${data.currency?.toUpperCase() || 'USD'}`, inline: true }
      ]
      break
    
    case 'customer.created':
    case 'customer.updated':
      embed.fields = [
        { name: 'Email', value: data.email || 'N/A', inline: true },
        { name: 'Name', value: data.name || 'N/A', inline: true }
      ]
      break
    
    case 'customer.deleted':
      embed.fields = [
        { name: 'Customer ID', value: data.id || 'N/A', inline: true }
      ]
      break
    
    default:
      embed.fields = [
        { name: 'Event Type', value: eventType, inline: true }
      ]
  }

  return embed
}

export { getEventEmbed }