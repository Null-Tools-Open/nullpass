import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { protectRoute } from '@/lib/arcjet'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const domainSchema = z.object({
  domain: z.string().min(1).max(255),
})

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const { domain } = domainSchema.parse(body)

    const dropService = await prisma.userServiceEntitlement.findUnique({
      where: {
        userId_service: {
          userId: auth.userId,
          service: 'DROP',
        },
      },
    })

    if (!dropService || dropService.tier !== 'enterprise') {
      return errorResponse('Enterprise plan required for custom domains', 403, request.headers.get('origin'))
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/
    if (!domainRegex.test(domain.trim())) {
      return errorResponse('Invalid domain format', 400, request.headers.get('origin'))
    }

    const allEntitlements = await prisma.userServiceEntitlement.findMany({
      where: {
        service: 'DROP',
        userId: {
          not: auth.userId,
        },
      },
      select: {
        metadata: true,
      },
    })

    const existingDomain = allEntitlements.find((entitlement: { metadata: any }) => {
      const metadata = (entitlement.metadata as any) || {}
      return metadata.customDomain === domain.trim()
    })

    if (existingDomain) {
      return errorResponse('Domain is already in use', 409, request.headers.get('origin'))
    }

    const currentMetadata = (dropService.metadata as any) || {}
    await prisma.userServiceEntitlement.update({
      where: {
        userId_service: {
          userId: auth.userId,
          service: 'DROP',
        },
      },
      data: {
        metadata: {
          ...currentMetadata,
          customDomain: domain.trim(),
          customDomainVerified: false,
        },
      },
    })

    await createAuditLog(auth.userId, 'USER_UPDATE', {
      field: 'customDomain',
      value: domain.trim(),
    })

    return jsonResponse({
      success: true,
      domain: domain.trim(),
      message: 'Domain connected successfully. Please configure your DNS settings.',
    }, 200, request.headers.get('origin'))
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return errorResponse(error.errors[0].message, 400, request.headers.get('origin'))
    }
    console.error('Custom domain error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}

export async function DELETE(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const dropService = await prisma.userServiceEntitlement.findUnique({
      where: {
        userId_service: {
          userId: auth.userId,
          service: 'DROP',
        },
      },
    })

    if (!dropService || dropService.tier !== 'enterprise') {
      return errorResponse('Enterprise plan required for custom domains', 403, request.headers.get('origin'))
    }

    const currentMetadata = (dropService.metadata as any) || {}
    const { customDomain, customDomainVerified, ...restMetadata } = currentMetadata

    await prisma.userServiceEntitlement.update({
      where: {
        userId_service: {
          userId: auth.userId,
          service: 'DROP',
        },
      },
      data: {
        metadata: restMetadata,
      },
    })

    await createAuditLog(auth.userId, 'USER_UPDATE', {
      field: 'customDomain',
      value: null,
    })

    return jsonResponse({
      success: true,
      message: 'Custom domain disconnected successfully',
    }, 200, request.headers.get('origin'))
  } catch (error) {
    console.error('Custom domain disconnect error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const dropService = await prisma.userServiceEntitlement.findUnique({
      where: {
        userId_service: {
          userId: auth.userId,
          service: 'DROP',
        },
      },
    })

    if (!dropService || dropService.tier !== 'enterprise') {
      return errorResponse('Enterprise plan required for custom domains', 403, request.headers.get('origin'))
    }

    const metadata = (dropService.metadata as any) || {}
    const customDomain = metadata.customDomain || null
    const customDomainVerified = metadata.customDomainVerified || false

    return jsonResponse({
      customDomain,
      customDomainVerified,
      hasCustomDomain: !!customDomain,
    }, 200, request.headers.get('origin'))
  } catch (error) {
    console.error('Custom domain get error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}