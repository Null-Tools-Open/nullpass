import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { protectRoute } from '@/lib/arcjet'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const entitlement = await prisma.userServiceEntitlement.findUnique({
      where: {
        userId_service: {
          userId: auth.userId,
          service: 'DROP',
        },
      },
      select: { polarSubscriptionId: true },
    })

    if (!entitlement?.polarSubscriptionId) {
      return errorResponse('No active subscription', 404, request.headers.get('origin'))
    }

    const response = await fetch(`https://api.polar.sh/v1/subscriptions/${entitlement.polarSubscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      return errorResponse('Failed to fetch subscription data', 500, request.headers.get('origin'))
    }

    const subscription = await response.json()
    
    return jsonResponse({
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start).getTime() / 1000 : 0,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end).getTime() / 1000 : 0,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      plan: subscription.metadata?.plan || 'unknown',
      billingCycle: subscription.metadata?.billingCycle || 'monthly',
      price: {
        amount: subscription.price?.price_currency === 'usd' 
          ? Math.round(((subscription.price?.price_amount || 0) / 100) * 4)
          : (subscription.price?.price_amount || 0) / 100,
        currency: 'pln',
        interval: subscription.price?.recurring_interval || 'month'
      },
      product: {
        name: subscription.product?.name || 'Premium'
      }
    }, 200, request.headers.get('origin'))
  } catch (error) {
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}