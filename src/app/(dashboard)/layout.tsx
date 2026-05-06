import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NavLinks from './NavLinks'
import { LogOut } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-sm font-bold text-white leading-tight">ASIA TEXTILE CO., LTD.</h1>
          <p className="text-xs text-slate-400 mt-1">{session.user?.name}</p>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-3 border-t border-slate-700">
          <a href="/api/auth/signout" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors w-full">
            <LogOut className="w-4 h-4" /> ออกจากระบบ
          </a>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
