import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MaterialOutsideForm from './MaterialOutsideForm'

export default async function MaterialOutsidePage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <MaterialOutsideForm />
}
