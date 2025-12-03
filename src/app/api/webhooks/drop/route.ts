import { Webhooks } from "@polar-sh/nextjs"
import { handlePolarWebhook } from '@/lib/webhook-handlers'

export const POST = Webhooks({
  webhookSecret: process.env.DROP_POLAR_SECRET!,
  
  onPayload: async (payload) => {
    await handlePolarWebhook(payload, 'DROP')
  },
})