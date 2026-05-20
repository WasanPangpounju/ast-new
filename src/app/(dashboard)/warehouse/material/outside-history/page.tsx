import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OutsideHistoryList from './OutsideHistoryList'

export default async function OutsideHistoryPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <OutsideHistoryList />
}
