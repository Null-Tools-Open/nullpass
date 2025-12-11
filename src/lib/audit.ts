import { prisma } from '@/lib/prisma'

type AuditAction = 
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_REGISTER'
  | 'PASSWORD_CHANGE'
  | 'TWO_FACTOR_ENABLE'
  | 'TWO_FACTOR_DISABLE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'SESSION_CREATE'
  | 'SESSION_DELETE'
  | 'SERVICE_ACCESS_GRANT'
  | 'SERVICE_ACCESS_REVOKE'
  | 'SERVICE_TIER_CHANGE'
  | 'SUBSCRIPTION_CREATE'
  | 'SUBSCRIPTION_UPDATE'
  | 'SUBSCRIPTION_CANCEL'
  | 'SUBSCRIPTION_REVOKE'
  | 'USER_BAN'
  | 'USER_DISABLE'
  | 'SERVICE_ENTITLEMENT_DISCONNECT'
  | 'SERVICE_ENTITLEMENT_CONNECT'
  | 'UNKNOWN'

export async function createAuditLog(
  userId: string,
  action: AuditAction,
  data: Record<string, any> = {}
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: action as any,
        data,
      },
    })
  } catch (error) {
  }
}