import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MaterialHistoryList from './MaterialHistoryList'

export default async function MaterialHistoryPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <MaterialHistoryList />
}
