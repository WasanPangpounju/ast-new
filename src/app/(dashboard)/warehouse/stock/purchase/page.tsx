import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PurchaseStockForm from './PurchaseStockForm'

export default async function PurchaseStockPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <PurchaseStockForm emp={session.user?.name ?? ''} />
}
