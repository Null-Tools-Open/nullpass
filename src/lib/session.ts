export const SESSION_EXPIRES_DAYS = parseInt(process.env.SESSION_EXPIRES_DAYS || '7')

export function getSessionExpiresAt(): Date {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRES_DAYS)
  return expiresAt
}