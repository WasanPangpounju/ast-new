'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ALL_MENUS } from '@/lib/menus'

interface UserPermission {
  menuKey: string
  canAccess: boolean
}

interface User {
  id: number
  name: string
  email: string
  role: string
  createdAt: string
  permissions: UserPermission[]
}

const ROLE_OPTIONS = [
  { value: 'user',      label: 'ผู้ใช้ทั่วไป' },
  { value: 'sales',     label: 'ระบบซื้อขาย' },
  { value: 'warehouse', label: 'ระบบคลังสินค้า' },
  { value: 'material',  label: 'ระบบวัตถุดิบ' },
  { value: 'admin',     label: 'แอดมิน' },
]

function roleBadge(role: string) {
  if (role === 'admin')     return 'bg-purple-100 text-purple-700'
  if (role === 'sales')     return 'bg-green-100 text-green-700'
  if (role === 'warehouse') return 'bg-blue-100 text-blue-700'
  if (role === 'material')  return 'bg-orange-100 text-orange-700'
  return 'bg-gray-100 text-gray-700'
}

function roleLabel(role: string) {
  return ROLE_OPTIONS.find(r => r.value === role)?.label ?? role
}

const GROUPS = Array.from(new Set(ALL_MENUS.map(m => m.group)))

function GroupCheckbox({
  group,
  checked,
  onChange,
}: {
  group: string
  checked: boolean[]
  onChange: (keys: string[], val: boolean) => void
}) {
  const keys = ALL_MENUS.filter(m => m.group === group).map(m => m.key)
  const allChecked = checked.every(Boolean)
  const someChecked = checked.some(Boolean)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = someChecked && !allChecked
    }
  }, [someChecked, allChecked])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allChecked}
      onChange={e => onChange(keys, e.target.checked)}
      className="cursor-pointer"
    />
  )
}

interface ModalProps {
  user: User | null
  onClose: () => void
  onSaved: () => void
}

function UserModal({ user, onClose, onSaved }: ModalProps) {
  const isEdit = !!user
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user?.role ?? 'user')
  const [menuKeys, setMenuKeys] = useState<Set<string>>(
    new Set(user?.permissions.filter(p => p.canAccess).map(p => p.menuKey) ?? [])
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleKey(key: string) {
    setMenuKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function toggleKeys(keys: string[], val: boolean) {
    setMenuKeys(prev => {
      const next = new Set(prev)
      keys.forEach(k => val ? next.add(k) : next.delete(k))
      return next
    })
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const body = {
        name, email, role,
        menuKeys: Array.from(menuKeys),
        ...(password ? { password } : {}),
      }
      const res = isEdit
        ? await fetch(`/api/admin/users/${user!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, password }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            {isEdit ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">ชื่อ</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ชื่อ-นามสกุล"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">อีเมล</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              รหัสผ่าน{isEdit && <span className="text-gray-400 ml-1">(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</span>}
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isEdit ? '••••••••' : 'กำหนดรหัสผ่าน'}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">บทบาท</label>
            <select
              value={role} onChange={e => setRole(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">สิทธิ์การเข้าถึงเมนู</label>
            {role === 'admin' ? (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2.5 rounded-lg">
                แอดมินมีสิทธิ์เข้าถึงทุกเมนูอัตโนมัติ
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden mt-1">
                {GROUPS.map(group => {
                  const groupMenus = ALL_MENUS.filter(m => m.group === group)
                  const groupKeys = groupMenus.map(m => m.key)
                  const checked = groupKeys.map(k => menuKeys.has(k))
                  return (
                    <div key={group}>
                      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                          <GroupCheckbox group={group} checked={checked} onChange={toggleKeys} />
                          {group}
                        </label>
                        <span className="text-xs text-gray-400">{checked.filter(Boolean).length}/{groupMenus.length}</span>
                      </div>
                      <div className="px-3 py-2 grid grid-cols-2 gap-1 ml-6">
                        {groupMenus.map(menu => (
                          <label key={menu.key} className="flex items-center gap-2 cursor-pointer py-0.5 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={menuKeys.has(menu.key)}
                              onChange={() => toggleKey(menu.key)}
                              className="cursor-pointer"
                            />
                            {menu.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                กำลังบันทึก...
              </span>
            ) : (isEdit ? 'บันทึก' : 'เพิ่มผู้ใช้')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null })
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const fetchUsers = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleDelete(id: number) {
    setDeleting(id)
    try {
      await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      setConfirmDelete(null)
      fetchUsers()
    } finally {
      setDeleting(null)
    }
  }

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear() + 543}`
    } catch { return '-' }
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 max-w-full">
      {/* Search bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ค้นหา</label>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ชื่อหรืออีเมล..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">จัดการผู้ใช้</h1>
          <p className="text-xs text-gray-500">ทั้งหมด {filtered.length} รายการ</p>
        </div>
        <button
          onClick={() => setModal({ open: true, user: null })}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + เพิ่มผู้ใช้
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full">
        <div className="w-full overflow-x-auto">
          <table className="min-w-[600px] text-xs w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ชื่อ / อีเมล</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-28">บทบาท</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 hidden md:table-cell w-32">สิทธิ์เมนู</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 hidden sm:table-cell w-28">วันที่สร้าง</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-36">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : filtered.map(user => (
                <tr key={user.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2.5 text-gray-400">{user.id}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{user.name}</div>
                    <div className="text-gray-400 mt-0.5">{user.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge(user.role)}`}>
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-3 py-2.5 text-gray-500">
                    {user.role === 'admin' ? (
                      <span className="text-purple-600">ทุกเมนู</span>
                    ) : (
                      <span>{user.permissions.filter(p => p.canAccess).length} เมนู</span>
                    )}
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-gray-500">{fmtDate(user.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      {confirmDelete === user.id ? (
                        <>
                          <span className="text-xs text-gray-500 mr-1">ยืนยันลบ?</span>
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={deleting === user.id}
                            className="bg-red-600 text-white rounded text-xs px-2 py-1 hover:bg-red-700 disabled:opacity-60"
                          >
                            {deleting === user.id ? '...' : 'ยืนยัน'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="border border-gray-300 rounded text-xs px-2 py-1 hover:bg-gray-50 text-gray-600"
                          >
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setModal({ open: true, user })}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            className="bg-red-50 text-red-600 rounded hover:bg-red-100 text-xs px-2 py-1"
                          >
                            ลบ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal.open && (
        <UserModal
          user={modal.user}
          onClose={() => setModal({ open: false, user: null })}
          onSaved={() => { setModal({ open: false, user: null }); fetchUsers() }}
        />
      )}
    </div>
  )
}
