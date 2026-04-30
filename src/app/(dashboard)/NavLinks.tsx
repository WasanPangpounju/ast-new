'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

type NavItem = {
  href?: string
  label: string
  icon: string
  children?: { href: string; label: string }[]
}

const navItems: NavItem[] = [
  { href: '/', label: 'หน้าหลัก', icon: '🏠' },
  {
    label: 'ระบบคลังสินค้า', icon: '🏭',
    children: [
      { href: '/warehouse/stock/create', label: 'คีย์ผ้าเข้าสต็อก' },
      { href: '/warehouse/fabric-in/review', label: 'ตรวจสอบคีย์ผ้า' },
      { href: '/warehouse/stock/purchase', label: 'คีย์ผ้าซื้อเข้า' },
      { href: '/warehouse/stock/purchase/review', label: 'ตรวจสอบผ้าซื้อเข้า' },
      { href: '/warehouse/bill/create', label: 'เปิดบิลผ้า' },
      { href: '/warehouse/bill', label: 'พิมพ์บิลส่งของ' },
      { href: '/warehouse/orders', label: 'ออร์เดอร์ลูกค้า' },
      { href: '/warehouse/stock', label: 'สต็อกผ้า' },
      { href: '/warehouse/stock-deposit', label: 'สต็อกผ้าฝากจัดเก็บ' },
    ]
  },
]

export default function NavLinks() {
  const pathname = usePathname()
  const [open, setOpen] = useState<string | null>('ระบบคลังสินค้า')

  return (
    <div className="space-y-0.5">
      {navItems.map(item => {
        if (item.children) {
          const isOpen = open === item.label
          const hasActive = item.children.some(c => pathname.startsWith(c.href))
          return (
            <div key={item.label}>
              <button
                onClick={() => setOpen(isOpen ? null : item.label)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
                  ${hasActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </span>
                <span className="text-xs opacity-60">{isOpen ? '▼' : '▶'}</span>
              </button>
              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                  {item.children.map(child => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`block px-2 py-1.5 rounded-md text-xs transition-colors
                        ${pathname === child.href || pathname.startsWith(child.href + '/')
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        }
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href!}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
              ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
