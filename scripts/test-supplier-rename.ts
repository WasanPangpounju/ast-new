// API test: renaming a supplier keeps its imports counted (lib/supplier-names.ts) — นำเข้า follows
// the rename, ต้องส่งคืน never ends up above นำเข้า, ambiguous renames are refused.
// Needs a dev server (TEST_BASE_URL) and DATABASE_URL on the same database. Renames a real
// supplier (แพรกษา) and back — run it on a scratch copy.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const TAG = `test-suprename-${Date.now()}`

/** Same throwaway-user + credentials-login pattern as the other package-return test scripts. */
async function authenticate(menuKeys: string[]): Promise<{ cookie: string; userId: number }> {
  const email = `${TAG}-${Math.random().toString(36).slice(2)}@example.test`
  const password = 'test-password-123'
  const user = await prisma.user.create({
    data: { name: 'Test Runner', email, password: await bcrypt.hash(password, 10), role: 'user' },
  })
  if (menuKeys.length) {
    await prisma.userPermission.createMany({ data: menuKeys.map(menuKey => ({ userId: user.id, menuKey, canAccess: true })) })
  }
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const csrfCookies = csrfRes.headers.getSetCookie()
  const { csrfToken } = await csrfRes.json()
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials?json=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies.map(c => c.split(';')[0]).join('; ') },
    body: new URLSearchParams({ email, password, csrfToken }).toString(),
    redirect: 'manual',
  })
  const allCookies = [...csrfCookies, ...loginRes.headers.getSetCookie()].map(c => c.split(';')[0])
  if (!allCookies.some(c => /session-token=/.test(c))) throw new Error(`Login failed — no session cookie (status ${loginRes.status})`)
  return { cookie: allCookies.join('; '), userId: user.id }
}

let failures = 0
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  if (!cond) failures++
}

type Summary = { imported: Record<string, number>; due: Record<string, number>; outstanding: Record<string, number> }
const overColumns = (s: Summary) => Object.keys(s.imported).filter(k => s.due[k] > s.imported[k] || s.outstanding[k] > s.imported[k])

async function main() {
  const { cookie, userId } = await authenticate(['material.history', 'package-returns.record'])
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const rename = (id: number, name: string) => call(`/api/sales/suppliers/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
  const summary = async (supplierId: number): Promise<Summary> => (await call(`/api/warehouse/package-returns/summary?supplierId=${supplierId}`)).json.data

  const nameA = `${TAG} บริษัท A`
  const sup = await prisma.supplier.create({ data: { name: nameA } })
  const dup1 = await prisma.supplier.create({ data: { name: `${TAG} ชื่อซ้ำ` } })
  const dup2 = await prisma.supplier.create({ data: { name: `${TAG} ชื่อซ้ำ` } })
  const other = await prisma.supplier.create({ data: { name: `${TAG} บริษัท อื่น` } })
  const supplierIds = [sup.id, dup1.id, dup2.id, other.id]
  const extraMaterials: number[] = []
  const m = await prisma.material.create({
    data: { lot: TAG, spool: 10, yarnType: 'TEST', supplierName: nameA, weightKgNet: 1, weightKgSum: 1, weightKgPackage: 0, box: 5, returnBox: true },
  })
  await prisma.packageReturnObligation.create({ data: { sourceType: 'MATERIAL_IMPORT', materialId: m.id, supplierId: sup.id, category: 'BOX', qtyDue: 5 } })
  const prak = await prisma.supplier.findFirst({ where: { name: 'บริษัท แพรกษาเท็กซ์ไทล์ จำกัด', deletedAt: null } })

  try {
    let s = await summary(sup.id)
    check('before rename: นำเข้า box 5, ต้องส่งคืน 5', s.imported.box === 5 && s.due.box === 5, { imp: s.imported.box, due: s.due.box })

    let r = await rename(sup.id, `${TAG} บริษัท A ใหม่`)
    check('rename → 200', r.status === 200, r.json)
    check('old name recorded', (await prisma.auditLog.count({ where: { tableName: 'suppliers', recordKey: String(sup.id), fieldName: 'name', oldValue: nameA } })) === 1)
    check('materials.supplierName untouched (still the old name)', (await prisma.material.findUniqueOrThrow({ where: { id: m.id } })).supplierName === nameA)
    s = await summary(sup.id)
    check('after rename: นำเข้า still counted (box 5)', s.imported.box === 5, s.imported.box)
    check('after rename: no column ต้องส่งคืน/คงค้าง > นำเข้า', overColumns(s).length === 0, overColumns(s))

    // the import still carries the old name: obligations it creates stay with the renamed supplier
    r = await call(`/api/warehouse/material/${m.id}`, { method: 'PATCH', body: JSON.stringify({ box: 0 }) })
    r = await call(`/api/warehouse/material/${m.id}`, { method: 'PATCH', body: JSON.stringify({ box: 2 }) })
    const recreated = await prisma.packageReturnObligation.findFirst({ where: { materialId: m.id, deletedAt: null } })
    check('import with old name edited: obligation goes to the renamed supplier, not the assignment queue',
      r.status === 200 && recreated?.supplierId === sup.id && recreated?.needsSupplierAssignment === false, { status: r.status, recreated })
    r = await call(`/api/warehouse/material/${m.id}`, { method: 'PATCH', body: JSON.stringify({ supplierName: `${TAG} บริษัท A ใหม่` }) })
    check('import switched to the new name: same company, obligation stays', r.status === 200 && (await prisma.packageReturnObligation.findFirst({ where: { materialId: m.id, deletedAt: null } }))?.supplierId === sup.id, r.json)

    r = await rename(dup1.id, `${TAG} ชื่อซ้ำ แก้แล้ว`)
    check('rename one of two suppliers sharing a name → 409', r.status === 409 && /ชื่อเดียวกัน/.test(r.json?.error), r.json)
    r = await rename(sup.id, other.name)
    check('rename to a name another supplier holds → 409', r.status === 409 && /เป็นของซัพพลายเออร์/.test(r.json?.error), r.json)
    r = await call(`/api/sales/suppliers/${other.id}`, { method: 'PUT', body: JSON.stringify({ name: other.name, tel: '021234567' }) })
    check('edit without a name change → 200, no rename row', r.status === 200 && (await prisma.auditLog.count({ where: { tableName: 'suppliers', recordKey: String(other.id) } })) === 0, r.json)

    // ── a name another supplier was renamed away from can't be given to anyone else ──
    r = await call('/api/sales/suppliers', { method: 'POST', body: JSON.stringify({ name: nameA, tax: '0000000000000' }) })
    if (r.status === 201) supplierIds.push(r.json.supplier.id)
    check('create a supplier named after another supplier old name → 409', r.status === 409 && /ชื่อเดิมของซัพพลายเออร์รหัส/.test(r.json?.error), r.json)
    r = await rename(other.id, nameA)
    check('rename to another supplier old name → 409', r.status === 409 && /ชื่อเดิมของซัพพลายเออร์รหัส/.test(r.json?.error), r.json)
    r = await rename(sup.id, nameA)
    check('a supplier may take its own old name back → 200', r.status === 200, r.json)
    check('…and its imports are still counted', (await summary(sup.id)).imported.box === 2)

    // ── delete refused while anything is still owed back ──
    r = await call(`/api/sales/suppliers/${sup.id}`, { method: 'DELETE' })
    check('delete supplier with ต้องส่งคืน outstanding → 409 naming กล่อง 2', r.status === 409 && /คงค้าง/.test(r.json?.error) && /กล่อง 2/.test(r.json?.error), r.json)
    check('…supplier not deleted', (await prisma.supplier.findUniqueOrThrow({ where: { id: sup.id } })).deletedAt === null)
    const done = await prisma.supplier.create({ data: { name: `${TAG} คืนครบแล้ว` } })
    supplierIds.push(done.id)
    const doneMat = await prisma.material.create({
      data: { lot: TAG, spool: 1, yarnType: 'TEST', supplierName: done.name, weightKgNet: 1, weightKgSum: 1, weightKgPackage: 0, box: 1, returnBox: true },
    })
    extraMaterials.push(doneMat.id)
    await prisma.packageReturnObligation.create({ data: { sourceType: 'MATERIAL_IMPORT', materialId: doneMat.id, supplierId: done.id, category: 'BOX', qtyDue: 1, qtyReturned: 1, status: 'RETURNED' } })
    r = await call(`/api/sales/suppliers/${done.id}`, { method: 'DELETE' })
    check('delete supplier whose packaging is all returned → 200', r.status === 200, r.json)
    r = await call(`/api/sales/suppliers/${other.id}`, { method: 'DELETE' })
    check('delete supplier with no obligations → 200', r.status === 200, r.json)

    // a real company with carried-forward legacy data
    if (prak) {
      const before = await summary(prak.id)
      r = await rename(prak.id, `${prak.name} ${TAG}`)
      const after = await summary(prak.id)
      check('แพรกษา renamed: นำเข้า unchanged in every column', r.status === 200 && JSON.stringify(after.imported) === JSON.stringify(before.imported), { before: before.imported, after: after.imported })
      check('แพรกษา renamed: no column ต้องส่งคืน/คงค้าง > นำเข้า', overColumns(after).length === 0, overColumns(after))
      r = await rename(prak.id, prak.name)
      check('แพรกษา renamed back → 200, summary as before', r.status === 200 && JSON.stringify((await summary(prak.id)).imported) === JSON.stringify(before.imported))
    } else console.log('SKIP  แพรกษา not in this database')
  } finally {
    if (prak) await prisma.supplier.update({ where: { id: prak.id }, data: { name: prak.name } })
    await prisma.auditLog.deleteMany({ where: { changedBy: { startsWith: TAG } } })
    const matIds = [m.id, ...extraMaterials]
    const obls = await prisma.packageReturnObligation.findMany({ where: { materialId: { in: matIds } }, select: { id: true } })
    await prisma.auditLog.deleteMany({ where: { tableName: 'package_return_obligations', recordKey: { in: obls.map(o => String(o.id)) } } })
    await prisma.packageReturnObligation.deleteMany({ where: { materialId: { in: matIds } } })
    await prisma.auditLog.deleteMany({ where: { tableName: 'materials', recordKey: { in: matIds.map(String) } } })
    await prisma.material.deleteMany({ where: { id: { in: matIds } } })
    await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } })
    await prisma.userPermission.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  }

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
