import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MaterialCreateForm from './MaterialCreateForm'

export default async function MaterialCreatePage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <MaterialCreateForm emp={session.user?.name ?? ''} />
}
