import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { requirePermission, PermissionError } from '@/lib/permissions'
import NeedsSupplierList from './NeedsSupplierList'

// First page in the project gated by menuKey, not just session presence — the
// allowedMenuKeys mechanism in (dashboard)/layout.tsx only hides this page's sidebar
// link, it never blocked a direct URL visit. Reuses the same requirePermission()
// the API routes use, so a user without the menu can't reach this page either.
export default async function NeedsSupplierPage() {
  const session = await auth()
  if (!session) redirect('/login')

  try {
    await requirePermission(session, 'package-returns.assign-supplier')
  } catch (err) {
    if (err instanceof PermissionError) redirect('/')
    throw err
  }

  return <NeedsSupplierList />
}
