import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleCors, jsonResponse, errorResponse, corsHeaders } from '@/lib/response'
import { requireAuth } from '@/lib/middleware'
import { logger } from '@/lib/logger'
import { protectRoute } from '@/lib/arcjet'
import { createAuditLog } from '@/lib/audit'
import { promises as fs } from 'fs'
import path from 'path'

const AVATARS_BASE_PATH = process.env.AVATARS_PATH || path.join(process.cwd(), 'src', 'avatars')
const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

async function ensureUserAvatarDir(userId: string): Promise<string> {
  const userDir = path.join(AVATARS_BASE_PATH, userId)
  await fs.mkdir(userDir, { recursive: true })
  return userDir
}

async function deleteOldAvatar(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    })

    if (!user?.avatar) {
      return
    }

    if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
      return
    }

    const normalizedPath = user.avatar.replace(/\//g, path.sep)
    const oldAvatarPath = path.join(AVATARS_BASE_PATH, normalizedPath)
    
    try {
      await fs.unlink(oldAvatarPath)
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.warn('Failed to delete old avatar:', error)
      }
    }
  } catch (error) {
    logger.warn('Error deleting old avatar:', error)
  }
}

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

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const avatarPath = await getUserAvatarPath(auth.userId)

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
    logger.error('Get avatar error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  const blocked = await protectRoute(request)
  if (blocked) return blocked

  const auth = await requireAuth(request)
  if ('error' in auth) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('avatar') as File | null

    if (!file) {
      return errorResponse('No file provided', 400, request.headers.get('origin'))
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse('File too large. Maximum size is 2MB', 400, request.headers.get('origin'))
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return errorResponse(
        'Invalid file type. Allowed types: JPEG, PNG, WebP, GIF',
        400,
        request.headers.get('origin')
      )
    }

    await deleteOldAvatar(auth.userId)

    const userDir = await ensureUserAvatarDir(auth.userId)

    const ext = file.type === 'image/jpeg' ? '.jpg' :
                file.type === 'image/png' ? '.png' :
                file.type === 'image/webp' ? '.webp' :
                file.type === 'image/gif' ? '.gif' :
                '.jpg'
    
    const filename = `avatar_${Date.now()}${ext}`
    const filePath = path.join(userDir, filename)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await fs.writeFile(filePath, buffer)

    const relativePath = `${auth.userId}/${filename}`
    await prisma.user.update({
      where: { id: auth.userId },
      data: { avatar: relativePath },
    })

    await createAuditLog(auth.userId, 'USER_UPDATE', {
      fields: ['avatar'],
    })

    return jsonResponse(
      {
        avatar: relativePath,
        message: 'Avatar uploaded successfully',
      },
      200,
      request.headers.get('origin')
    )
  } catch (error: any) {
    logger.error('Upload avatar error:', error)
    return errorResponse('Internal server error', 500, request.headers.get('origin'))
  }
}