import { NextRequest } from 'next/server'
import crypto from 'crypto'

const IP_ENCRYPTION_SECRET = process.env.IP_ENCRYPTION_SECRET
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function deriveKey(userId: string): Buffer {
  const keyMaterial = `${userId}:${IP_ENCRYPTION_SECRET}`
  return crypto.pbkdf2Sync(keyMaterial, 'ip-encryption-salt', 100000, 32, 'sha256')
}

export function encryptIp(ip: string, userId: string): string {
  if (ip === 'unknown') {
    return 'unknown'
  }

  try {
    const key = deriveKey(userId)
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(ip, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const tag = cipher.getAuthTag()

    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
  } catch (error) {
    return 'unknown'
  }
}

export function decryptIp(encryptedIp: string, userId: string): string {
  if (encryptedIp === 'unknown' || !encryptedIp.includes(':')) {
    return encryptedIp
  }

  try {
    const parts = encryptedIp.split(':')
    if (parts.length !== 3) {
      return 'unknown'
    }

    const [ivHex, tagHex, encrypted] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const key = deriveKey(userId)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    return 'unknown'
  }
}

export function getClientIpFromHeaders(getHeader: (name: string) => string | null): string {
  const clientIp = getHeader('x-client-ip')
  if (clientIp) {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clientIp)) {
      return clientIp
    }
    return clientIp
  }
  
  const forwardedFor = getHeader('x-forwarded-for')
  const realIp = getHeader('x-real-ip')
  
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim())
    
    const ipv4 = ips.find(ip => {
      return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)
    })
    
    if (ipv4) {
      return ipv4
    }
    
    if (ips.length > 0) {
      return ips[0]
    }
  }
  
  if (realIp) {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(realIp)) {
      return realIp
    }
    return realIp
  }
  
  return 'unknown'
}

export function getClientIp(request: NextRequest): string {
  return getClientIpFromHeaders((name: string) => request.headers.get(name))
}

export function getClientIpForStorageFromHeaders(
  getHeader: (name: string) => string | null,
  userId: string
): string {
  const rawIp = getClientIpFromHeaders(getHeader)
  return encryptIp(rawIp, userId)
}

export function getClientIpForStorage(request: NextRequest, userId: string): string {
  return getClientIpForStorageFromHeaders((name: string) => request.headers.get(name), userId)
}