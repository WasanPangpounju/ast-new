import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RequisitionHistoryList from './RequisitionHistoryList'

export default async function RequisitionHistoryPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <RequisitionHistoryList />
}
