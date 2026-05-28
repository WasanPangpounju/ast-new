import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MaterialStockList from './MaterialStockList'

export default async function MaterialStockPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <MaterialStockList />
}
