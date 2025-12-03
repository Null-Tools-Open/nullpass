import { CustomerPortal } from "@polar-sh/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from '@/lib/middleware'
import { handleCors, errorResponse } from '@/lib/response'
import { protectRoute } from '@/lib/arcjet'
import { prisma } from '@/lib/prisma'

export const GET = async (req: NextRequest) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(req, { requested: 2 })
  if (blocked) return blocked

  const auth = await requireAuth(req)
  if ('error' in auth) return auth.error
  
  const entitlement = await prisma.userServiceEntitlement.findUnique({
    where: {
      userId_service: {
        userId: auth.userId,
        service: 'DROP',
      },
    },
    select: { polarCustomerId: true },
  })

  if (!entitlement?.polarCustomerId) {
    return errorResponse('No Polar customer ID found. Please contact support.', 400, req.headers.get('origin'))
  }

  try {
    const response = await fetch(`https://api.polar.sh/v1/customers/${entitlement.polarCustomerId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      return errorResponse('Customer not found in Polar. Please contact support to resolve this issue.', 400, req.headers.get('origin'))
    }
  } catch (error) {
    return errorResponse('Failed to verify customer. Please contact support.', 500, req.headers.get('origin'))
  }

  const customerPortalHandler = CustomerPortal({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    getCustomerId: async () => entitlement.polarCustomerId!,
    server: (process.env.POLAR_SERVER as "sandbox" | "production") || "production",
  })

  return customerPortalHandler(req)
}