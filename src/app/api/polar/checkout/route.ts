import { Checkout } from "@polar-sh/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from '@/lib/middleware'
import { handleCors, errorResponse } from '@/lib/response'
import { protectRoute } from '@/lib/arcjet'
import { prisma } from '@/lib/prisma'

const PRODUCT_IDS: Record<string, Record<string, string>> = {
  'pro-lite': {
    monthly: process.env.DROP_PRO_LITE_MONTHLY || '',
    yearly: process.env.DROP_PRO_LITE_YEARLY || '',
  },
  'pro': {
    monthly: process.env.DROP_PRO_MONTHLY || '',
    yearly: process.env.DROP_PRO_YEARLY || '',
  }
}

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request, { requested: 2 })
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  const searchParams = request.nextUrl.searchParams
  const plan = searchParams.get('plan')
  const billingCycle = searchParams.get('billingCycle')
  
  if (!plan || !billingCycle) {
    return errorResponse('Missing plan or billingCycle', 400, request.headers.get('origin'))
  }

  const productId = PRODUCT_IDS[plan]?.[billingCycle]
  
  if (!productId) {
    return errorResponse('Invalid plan or billingCycle', 400, request.headers.get('origin'))
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true },
  })

  if (!user) {
    return errorResponse('User not found', 404, request.headers.get('origin'))
  }

  const entitlement = await prisma.userServiceEntitlement.findUnique({
    where: {
      userId_service: {
        userId: auth.userId,
        service: 'DROP',
      },
    },
    select: { polarCustomerId: true },
  })

  const metadata = {
    plan,
    billingCycle,
    userId: user.id
  }

  let validCustomerId = null
  if (entitlement?.polarCustomerId) {
    try {
      const response = await fetch(`https://api.polar.sh/v1/customers/${entitlement.polarCustomerId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      })
      if (response.ok) {
        validCustomerId = entitlement.polarCustomerId
      }
    } catch (error) {
    }
  }

  const checkoutParams = new URLSearchParams({
    products: productId,
    metadata: JSON.stringify(metadata),
    customerEmail: user.email,
    ...(validCustomerId && { customerId: validCustomerId })
  })

  const checkoutHandler = Checkout({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nulldrop.xyz'}/settings?tab=premium&success=true`,
    server: (process.env.POLAR_SERVER as "sandbox" | "production") || "production",
  })

  const modifiedRequest = new NextRequest(
    `${request.url.split('?')[0]}?${checkoutParams.toString()}`,
    request
  )

  return checkoutHandler(modifiedRequest)
}