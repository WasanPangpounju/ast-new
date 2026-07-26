import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'

/** Thrown when a session is missing or lacks the required menuKey — routes catch this
 *  and respond with `status` (401 unauthenticated, 403 authenticated-but-forbidden). */
export class PermissionError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'PermissionError'
  }
}

/**
 * API-level permission guard — reuses the same menuKey / UserPermission mechanism that
 * (dashboard)/layout.tsx uses to decide which sidebar links to show. That system has so
 * far only ever filtered UI; this is the first place it gates an API route directly, so
 * a caller without the menu can't invoke the endpoint even by hitting the URL directly.
 * role === 'admin' always passes (mirrors layout.tsx: null allowedMenuKeys = every menu).
 */
export async function requirePermission(session: Session | null, menuKey: string): Promise<void> {
  if (!session?.user?.id) throw new PermissionError('Unauthorized', 401)

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      role: true,
      permissions: { where: { menuKey, canAccess: true }, select: { id: true } },
    },
  })

  if (!user) throw new PermissionError('Unauthorized', 401)
  if (user.role === 'admin') return
  if (user.permissions.length === 0) throw new PermissionError('ไม่มีสิทธิ์เข้าถึงเมนูนี้', 403)
}
