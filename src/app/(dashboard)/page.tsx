import { auth } from '@/lib/auth'
import Link from 'next/link'
import { ClipboardList, Scissors } from 'lucide-react'

export default async function DashboardPage() {
  const session = await auth()
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">ยินดีต้อนรับ, {session?.user?.name}</h1>
      <p className="text-sm text-gray-500 mb-6">ระบบจัดการคลังสินค้า AST Manufacturing</p>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <Link href="/orders" className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="mb-2"><ClipboardList className="w-8 h-8 text-gray-600" /></div>
          <div className="font-medium text-gray-900">ใบสั่งซื้อ</div>
          <div className="text-sm text-gray-500">จัดการ SO / PO</div>
        </Link>
        <Link href="/fabric" className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="mb-2"><Scissors className="w-8 h-8 text-gray-600" /></div>
          <div className="font-medium text-gray-900">ผ้า</div>
          <div className="text-sm text-gray-500">จัดการผ้าออก</div>
        </Link>
      </div>
    </div>
  )
}
