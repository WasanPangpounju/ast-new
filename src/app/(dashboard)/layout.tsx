import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SidebarLayout from './SidebarLayout'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex h-screen bg-gray-100">
      <SidebarLayout userName={session.user?.name} />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
