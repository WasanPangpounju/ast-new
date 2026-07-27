import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { requirePermission, PermissionError } from '@/lib/permissions'
import PackageReturnsRecord from './PackageReturnsRecord'

export default async function PackageReturnsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  try {
    await requirePermission(session, 'package-returns.record')
  } catch (err) {
    if (err instanceof PermissionError) redirect('/')
    throw err
  }

  return <PackageReturnsRecord emp={session.user?.name ?? ''} />
}
