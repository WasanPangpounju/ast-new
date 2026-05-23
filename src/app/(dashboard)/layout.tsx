import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SidebarLayout from './SidebarLayout'
import ReactQueryProvider from './ReactQueryProvider'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      role: true,
      permissions: { where: { canAccess: true }, select: { menuKey: true } },
    },
  })

  // null = admin (ทุกเมนู), string[] = เมนูที่อนุญาต
  const allowedMenuKeys: string[] | null =
    user?.role === 'admin' ? null : (user?.permissions.map((p) => p.menuKey) ?? [])

  return (
    <ReactQueryProvider>
      <div className="flex h-screen bg-gray-100">
        <SidebarLayout userName={session.user?.name} allowedMenuKeys={allowedMenuKeys} />
        <main className="flex-1 overflow-auto pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </ReactQueryProvider>
  )
}
