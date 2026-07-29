import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MaterialReturnForm from './MaterialReturnForm'

export default async function MaterialReturnPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <MaterialReturnForm />
}
