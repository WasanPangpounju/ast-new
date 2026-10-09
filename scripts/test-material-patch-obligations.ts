// API test: editing / deleting an import keeps its package-return obligations in step
// (PATCH + DELETE /api/warehouse/material/[id], lib/material-obligation-sync.ts).
// Needs a dev server (TEST_BASE_URL) and DATABASE_URL on the same database. The legacy part
// edits a carried-forward import (#2775 แพรกษา) — run it on a scratch copy, never a database
// you need to keep as is.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const TAG = `test-matsync-${Date.now()}`

/** Same throwaway-user + credentials-login pattern as the other package-return test scripts. */
async function authenticate(menuKeys: string[]): Promise<{ cookie: string; userId: number }> {
  const email = `${TAG}-${Math.random().toString(36).slice(2)}@example.test`
  const password = 'test-password-123'
  const user = await prisma.user.create({
    data: { name: 'Test Runner', email, password: await bcrypt.hash(password, 10), role: 'user' },
  })
  if (menuKeys.length) {
    await prisma.userPermission.createMany({
      data: menuKeys.map(menuKey => ({ userId: user.id, menuKey, canAccess: true })),
    })
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

async function main() {
  const { cookie, userId } = await authenticate(['material.history', 'package-returns.record'])
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const patch = (id: number, body: Record<string, unknown>) => call(`/api/warehouse/material/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  const ob = (id: number) => prisma.packageReturnObligation.findUniqueOrThrow({ where: { id } })
  const summary = async (supplierId: number) => (await call(`/api/warehouse/package-returns/summary?supplierId=${supplierId}`)).json.data
  const noColumnOver = (s: { imported: Record<string, number>; due: Record<string, number>; outstanding: Record<string, number> }) =>
    Object.keys(s.imported).every(k => s.due[k] <= s.imported[k] && s.outstanding[k] <= s.imported[k])

  const supA = await prisma.supplier.create({ data: { name: `${TAG} บริษัท A` } })
  const supB = await prisma.supplier.create({ data: { name: `${TAG} บริษัท B` } })
  const materialIds: number[] = []
  const newMaterial = async (box: number) => {
    const m = await prisma.material.create({
      data: { lot: TAG, spool: 10, yarnType: 'TEST', supplierName: supA.name, weightKgNet: 1, weightKgSum: 1, weightKgPackage: 0, box, returnBox: true },
    })
    materialIds.push(m.id)
    const o = await prisma.packageReturnObligation.create({
      data: { sourceType: 'MATERIAL_IMPORT', materialId: m.id, supplierId: supA.id, category: 'BOX', qtyDue: box },
    })
    return { m, o }
  }
  // legacy import #2775 (แพรกษา): its carried-forward rows, restored at the end
  const legacySnapshot = await prisma.packageReturnObligation.findMany({ where: { materialId: 2775 } })
  const legacyMaterial = await prisma.material.findUnique({ where: { id: 2775 } })

  try {
    // ── new-system import: quantity follows ──
    const { m: m1, o: o1 } = await newMaterial(10)
    let r = await patch(m1.id, { box: 7 })
    check('PATCH box 10 → 7: 200', r.status === 200, r.json)
    check('obligation qtyDue follows (7)', (await ob(o1.id)).qtyDue === 7)
    check('obligation change audited', (await prisma.auditLog.count({ where: { tableName: 'package_return_obligations', recordKey: String(o1.id), fieldName: 'qtyDue', oldValue: '10', newValue: '7' } })) === 1)

    r = await call('/api/warehouse/package-returns/receipts', { method: 'POST', body: JSON.stringify({ supplierId: supA.id, returnDate: '2026-10-09', box: 5 }) })
    check('return 5 boxes → 201', r.status === 201, r.json)

    r = await patch(m1.id, { box: 4 })
    check('PATCH below returned (4 < 5) → 409 naming กล่อง', r.status === 409 && /กล่อง/.test(r.json?.error) && /คืนไปแล้ว 5/.test(r.json?.error), r.json)
    check('refused edit rolled back: material box still 7', (await prisma.material.findUniqueOrThrow({ where: { id: m1.id } })).box === 7)
    check('refused edit rolled back: qtyDue still 7', (await ob(o1.id)).qtyDue === 7)

    r = await patch(m1.id, { box: 5 })
    check('PATCH box → 5 (= returned): 200', r.status === 200, r.json)
    const o1b = await ob(o1.id)
    check('qtyDue 5, status RETURNED', o1b.qtyDue === 5 && o1b.status === 'RETURNED', o1b)

    r = await patch(m1.id, { supplierName: supB.name })
    check('company change with returns → 409', r.status === 409 && /บริษัทเดิม/.test(r.json?.error), r.json)
    check('company change refused: material still company A', (await prisma.material.findUniqueOrThrow({ where: { id: m1.id } })).supplierName === supA.name)

    r = await call(`/api/warehouse/material/${m1.id}`, { method: 'DELETE' })
    check('DELETE import with returns → 409', r.status === 409 && /คืนบรรจุภัณฑ์แล้ว/.test(r.json?.error), r.json)
    check('DELETE refused: material not deleted', (await prisma.material.findUniqueOrThrow({ where: { id: m1.id } })).deletedAt === null)

    // ── nothing returned: company moves, delete takes the obligation along ──
    const { m: m2, o: o2 } = await newMaterial(3)
    r = await patch(m2.id, { supplierName: supB.name })
    check('company change without returns → 200', r.status === 200, r.json)
    check('obligation moved to company B', (await ob(o2.id)).supplierId === supB.id)
    const sA = await summary(supA.id)
    const sB = await summary(supB.id)
    check('company A summary: due box 5 = imported 5', sA.due.box === 5 && sA.imported.box === 5, { due: sA.due.box, imp: sA.imported.box })
    check('company B summary: due box 3 = imported 3', sB.due.box === 3 && sB.imported.box === 3, { due: sB.due.box, imp: sB.imported.box })

    r = await patch(m2.id, { box: 0 })
    check('PATCH box → 0 with nothing returned: 200', r.status === 200, r.json)
    check('obligation soft-deleted', (await ob(o2.id)).deletedAt !== null)
    r = await patch(m2.id, { box: 2 })
    check('PATCH box 0 → 2: obligation created again', r.status === 200 && (await prisma.packageReturnObligation.count({ where: { materialId: m2.id, deletedAt: null, qtyDue: 2, supplierId: supB.id } })) === 1, r.json)

    r = await call(`/api/warehouse/material/${m2.id}`, { method: 'DELETE' })
    check('DELETE import with nothing returned → 200', r.status === 200, r.json)
    check('its obligations soft-deleted with it', (await prisma.packageReturnObligation.count({ where: { materialId: m2.id, deletedAt: null } })) === 0)
    check('company B summary back to 0 due', (await summary(supB.id)).due.box === 0)

    // ── non-packaging edit leaves obligations alone ──
    const before = await ob(o1.id)
    r = await patch(m1.id, { note: 'แก้หมายเหตุ' })
    const afterNote = await ob(o1.id)
    check('note-only edit: obligation untouched', r.status === 200 && afterNote.updatedAt.getTime() === before.updatedAt.getTime())

    // ── carried-forward legacy import (#2775 แพรกษา: material 900, legacy rows 1200 → carried 900) ──
    if (legacyMaterial && legacySnapshot.some(o => o.legacyRef)) {
      const plastic = legacySnapshot.find(o => o.legacyRef === 'material:2775/spoolPlastic')!
      r = await patch(2775, { spool: 800 })
      check('legacy import spool 900 → 800: 200', r.status === 200, r.json)
      check('carried spoolPlastic follows (800)', (await ob(plastic.id)).qtyDue === 800)
      r = await patch(2775, { spool: 2000 })
      check('legacy import spool → 2000: carried due does not grow past legacy figure', r.status === 200 && (await ob(plastic.id)).qtyDue === 800)
      const prakSupplier = await prisma.supplier.findFirstOrThrow({ where: { name: legacyMaterial.supplierName } })
      check('แพรกษา summary: no column ต้องส่งคืน/คงค้าง > นำเข้า', noColumnOver(await summary(prakSupplier.id)))
    } else console.log('SKIP  legacy import #2775 not migrated in this database')

    const returnedLegacy = await prisma.packageReturnObligation.findFirst({
      where: { legacyRef: { not: null }, deletedAt: null, qtyReturned: { gt: 0 }, category: 'SPOOL', materialId: { not: null } },
      orderBy: { id: 'asc' },
    })
    if (returnedLegacy) {
      const lm = await prisma.material.findUniqueOrThrow({ where: { id: returnedLegacy.materialId! } })
      r = await patch(lm.id, { spool: Math.max(1, returnedLegacy.qtyReturned - 1) })
      check(`legacy import #${lm.id} spool below returned → 409`, r.status === 409, r.json)
      check('refused: material spool unchanged', (await prisma.material.findUniqueOrThrow({ where: { id: lm.id } })).spool === lm.spool)
      r = await patch(lm.id, { supplierName: supB.name })
      check(`legacy import #${lm.id} company change with returns → 409`, r.status === 409, r.json)
    } else console.log('SKIP  no carried-forward obligation with returns in this database')
  } finally {
    // put #2775 back exactly as it was (scratch copy or not)
    if (legacyMaterial) {
      await prisma.material.update({ where: { id: 2775 }, data: { spool: legacyMaterial.spool, supplierName: legacyMaterial.supplierName, updatedAt: legacyMaterial.updatedAt } })
      for (const o of legacySnapshot) {
        await prisma.packageReturnObligation.update({ where: { id: o.id }, data: { qtyDue: o.qtyDue, qtyReturned: o.qtyReturned, status: o.status, deletedAt: o.deletedAt, supplierId: o.supplierId } })
      }
      await prisma.packageReturnObligation.deleteMany({ where: { materialId: 2775, id: { notIn: legacySnapshot.map(o => o.id) } } })
      await prisma.auditLog.deleteMany({ where: { changedBy: { startsWith: TAG } } })
    }
    const obls = await prisma.packageReturnObligation.findMany({ where: { materialId: { in: materialIds } }, select: { id: true } })
    await prisma.packageReturnEntry.deleteMany({ where: { obligationId: { in: obls.map(o => o.id) } } })
    await prisma.packageReturnReceipt.deleteMany({ where: { supplierId: { in: [supA.id, supB.id] } } })
    await prisma.auditLog.deleteMany({ where: { tableName: 'package_return_obligations', recordKey: { in: obls.map(o => String(o.id)) } } })
    await prisma.packageReturnObligation.deleteMany({ where: { id: { in: obls.map(o => o.id) } } })
    await prisma.auditLog.deleteMany({ where: { tableName: 'materials', recordKey: { in: materialIds.map(String) } } })
    await prisma.material.deleteMany({ where: { id: { in: materialIds } } })
    await prisma.supplier.deleteMany({ where: { id: { in: [supA.id, supB.id] } } })
    await prisma.userPermission.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  }

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
