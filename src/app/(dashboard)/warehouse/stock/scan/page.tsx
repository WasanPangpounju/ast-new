import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ScanFabricForm from './ScanFabricForm'

export default async function ScanFabricPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <ScanFabricForm emp={session.user?.name ?? ''} />
}
