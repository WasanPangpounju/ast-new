import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MaterialRequisitionForm from './MaterialRequisitionForm'

export default async function MaterialRequisitionPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <MaterialRequisitionForm emp={session.user?.name ?? ''} />
}
