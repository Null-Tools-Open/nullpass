import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse, corsHeaders } from '@/lib/response'
import { logger } from '@/lib/logger'
import { promises as fs } from 'fs'
import path from 'path'

const INTERNAL_SECRET = process.env.INTERNAL_SECRET
const AVATARS_BASE_PATH = process.env.AVATARS_PATH || path.join(process.cwd(), 'src', 'avatars')

async function getUserAvatarPath(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  })

  if (!user?.avatar) {
    return null
  }

  if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
    return user.avatar
  }

  const normalizedPath = user.avatar.replace(/\//g, path.sep)
  const avatarPath = path.join(AVATARS_BASE_PATH, normalizedPath)
  
  try {
    await fs.access(avatarPath)
    return avatarPath
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const internalSecret = request.headers.get('x-internal-secret')
  
  if (!INTERNAL_SECRET || internalSecret !== INTERNAL_SECRET) {
    return errorResponse('Unauthorized', 401, request.headers.get('origin'))
  }

  try {
    const { userId } = await params
    const avatarPath = await getUserAvatarPath(userId)

    if (!avatarPath) {
      return errorResponse('Avatar not found', 404, request.headers.get('origin'))
    }

    if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
      return Response.redirect(avatarPath, 302)
    }

    const fileBuffer = await fs.readFile(avatarPath)
    const ext = path.extname(avatarPath).toLowerCase()
    const contentType = 
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.png' ? 'image/png' :
      ext === '.webp' ? 'image/webp' :
      ext === '.gif' ? 'image/gif' :
      'image/jpeg'

    return new Response(fileBuffer, {
      headers: {
        ...corsHeaders(request.headers.get('origin')),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    logger.error('Get avatar by userId error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}