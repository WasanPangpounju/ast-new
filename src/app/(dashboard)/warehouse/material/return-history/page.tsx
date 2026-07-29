import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MaterialReturnHistoryList from './MaterialReturnHistoryList'

export default async function MaterialReturnHistoryPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <MaterialReturnHistoryList />
}
