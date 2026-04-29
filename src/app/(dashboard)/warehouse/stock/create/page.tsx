import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import StockCreateForm from './StockCreateForm'

export default async function StockCreatePage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <StockCreateForm emp={session.user?.name ?? ''} />
}
