import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { protectRoute } from '@/lib/arcjet'
import { decryptIp } from '@/lib/ip-utils'

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const action = searchParams.get('action')

    const where: any = {
      userId: auth.userId,
    }

    if (action) {
      where.action = action
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: Math.min(limit, 100),
        skip: offset,
        select: {
          id: true,
          action: true,
          data: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    const logsWithDecryptedIp = logs.map(log => {
      const data = log.data as any
      if (data && typeof data === 'object' && 'ip' in data && typeof data.ip === 'string') {
        return {
          ...log,
          data: {
            ...data,
            ip: decryptIp(data.ip, auth.userId),
          },
        }
      }
      return log
    })

    return jsonResponse(
      {
        logs: logsWithDecryptedIp,
        total,
        limit,
        offset,
      },
      200,
      request.headers.get('origin')
    )
  } catch (error) {
    console.error('Get audit logs error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}