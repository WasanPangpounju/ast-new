import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FabricReturnPage from './FabricReturnPage'

export default async function WarehouseReturnsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <FabricReturnPage />
}
