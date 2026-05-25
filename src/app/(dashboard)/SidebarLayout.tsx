'use client'
import { useState, useEffect } from 'react'
import { LogOut, Menu, X } from 'lucide-react'
import NavLinks from './NavLinks'

interface Props {
  userName?: string | null
  allowedMenuKeys: string[] | null
}

export default function SidebarLayout({ userName, allowedMenuKeys }: Props) {
  const [open, setOpen] = useState(false)

  // ปิด sidebar เมื่อ resize ไป md+
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return ( 
    <>
      {/* Mobile topbar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
        <button type="button" onClick={() => setOpen(true)} aria-label="open menu">
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold truncate">ASIA TEXTILE CO., LTD.</span>
      </div>

      {/* Overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        w-60 bg-slate-800 text-white flex flex-col shrink-0 overflow-hidden
        md:h-full
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <div className="p-4 border-b border-slate-700 hidden md:block">
          <h1 className="text-sm font-bold text-white leading-tight">ASIA TEXTILE CO., LTD.</h1>
          <p className="text-xs text-slate-400 mt-1">{userName}</p>
        </div>
        {/* Mobile: close button */}
        <div className="h-14 md:hidden flex items-center justify-end px-3">
          <button type="button" onClick={() => setOpen(false)} aria-label="close menu"
            className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          <NavLinks onClose={() => setOpen(false)} allowedMenuKeys={allowedMenuKeys} />
        </nav>
        <div className="p-3 border-t border-slate-700">
          <a href="/api/auth/signout" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors w-full">
            <LogOut className="w-4 h-4" /> ออกจากระบบ
          </a>
        </div>
      </aside>
    </>
  )
}
