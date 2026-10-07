import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const MENU_KEY = 'package-returns.record'
const TAG = `test-receipts-${Date.now()}`

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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookies.map(c => c.split(';')[0]).join('; '),
    },
    body: new URLSearchParams({ email, password, csrfToken }).toString(),
    redirect: 'manual',
  })
  const allCookies = [...csrfCookies, ...loginRes.headers.getSetCookie()].map(c => c.split(';')[0])
  if (!allCookies.some(c => /session-token=/.test(c))) {
    throw new Error(`Login failed — no session cookie (status ${loginRes.status})`)
  }
  return { cookie: allCookies.join('; '), userId: user.id }
}

let failures = 0
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  if (!cond) failures++
}

async function main() {
  const userIds: number[] = []
  let twinId: number | null = null
  let twinObligationId: number | null = null
  const supplier = await prisma.supplier.create({ data: { name: `${TAG} บริษัททดสอบ` } })
  const material = await prisma.material.create({
    data: {
      lot: TAG, spool: 20, yarnType: 'TEST', supplierName: supplier.name,
      weightKgNet: 1, weightKgSum: 1, weightKgPackage: 0,
      pallet: 3, palletType: 'wood', box: 9, sack: 2, sackType: 'plastic', paperBar: 6, spoolType: 'spool_paper',
    },
  })
  const materialJute = await prisma.material.create({
    data: {
      lot: `${TAG}-jute`, spool: 0, yarnType: 'TEST', supplierName: supplier.name,
      weightKgNet: 1, weightKgSum: 1, weightKgPackage: 0, sack: 5, sackType: 'p',
    },
  })
  const t0 = Date.now()
  const mk = (category: 'SPOOL' | 'PALLET' | 'BOX' | 'SACK', variant: string | null, qtyDue: number, ageMs: number) =>
    prisma.packageReturnObligation.create({
      data: {
        sourceType: 'MATERIAL_IMPORT', materialId: material.id, supplierId: supplier.id,
        category, variant, qtyDue, createdAt: new Date(t0 - ageMs),
      },
    })
  const oSpoolPaper = await mk('SPOOL', 'spool_paper', 5, 5000)
  const oSpoolNull = await mk('SPOOL', null, 8, 4000)
  const oPalletWood = await mk('PALLET', 'wood', 3, 3000)
  const oBoxOld = await mk('BOX', null, 4, 2000)
  const oBoxNew = await mk('BOX', null, 3, 1000)
  const oSackPlastic = await mk('SACK', 'plastic', 3, 900)
  const oSackJute = await mk('SACK', 'p', 2, 800)
  const oSackNull = await mk('SACK', null, 4, 700)

  try {
    const { cookie, userId } = await authenticate([MENU_KEY])
    userIds.push(userId)
    const noPerm = await authenticate([])
    userIds.push(noPerm.userId)

    const api = (path: string, init: RequestInit = {}, c = cookie) =>
      fetch(`${BASE_URL}/api/warehouse/package-returns${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Cookie: c, ...(init.headers ?? {}) },
      })
    const summary = async () => (await (await api(`/summary?supplierId=${supplier.id}`)).json()).data
    const post = (body: object) => api('/receipts', { method: 'POST', body: JSON.stringify({ supplierId: supplier.id, ...body }) })

    // ── permission ──
    check('summary without permission → 403', (await api(`/summary?supplierId=${supplier.id}`, {}, noPerm.cookie)).status === 403)
    check('receipt POST without permission → 403',
      (await api('/receipts', { method: 'POST', body: JSON.stringify({ supplierId: supplier.id, returnDate: '2026-10-05', box: 1 }) }, noPerm.cookie)).status === 403)

    // ── supplier options ──
    const opts = (await (await api('/supplier-options')).json()).data as { id: number }[]
    check('supplier-options includes test supplier', opts.some(o => o.id === supplier.id))

    // ── summary before ──
    let s = await summary()
    check('นำเข้า from materials', s.imported.spoolPaper === 20 && s.imported.palletWood === 3 && s.imported.box === 9 && s.imported.sackPlastic === 2 && s.imported.sackJute === 5 && s.imported.sackUnspecified === 0 && s.imported.paperBar === 6, s.imported)
    check('ต้องส่งคืน grouped by column', s.due.spoolPaper === 5 && s.due.spoolUnspecified === 8 && s.due.palletWood === 3 && s.due.box === 7 && s.due.sackPlastic === 3 && s.due.sackJute === 2 && s.due.sackUnspecified === 4, s.due)
    check('คงค้าง = due before any return', s.outstanding.box === 7 && s.returned.box === 0, s.outstanding)

    // ── validation ──
    check('all zero → 400', (await post({ returnDate: '2026-10-05' })).status === 400)
    check('blank fields omitted but none > 0 → 400', (await post({ returnDate: '2026-10-05', box: 0 })).status === 400)
    check('negative → 400', (await post({ returnDate: '2026-10-05', box: -1 })).status === 400)
    check('decimal → 400', (await post({ returnDate: '2026-10-05', box: 1.5 })).status === 400)
    check('missing returnDate → 400', (await post({ box: 1 })).status === 400)

    // ── over-return ──
    let r = await post({ returnDate: '2026-10-05', box: 8 })
    let j = await r.json()
    check('box over outstanding → 409 naming กล่อง + remaining', r.status === 409 && /กล่อง/.test(j.error) && /7/.test(j.error), j)
    r = await post({ returnDate: '2026-10-05', spoolPaper: 14 })
    j = await r.json()
    check('spool over typed+unspecified → 409 naming หลอดไม่ระบุชนิด', r.status === 409 && /หลอดไม่ระบุชนิด/.test(j.error), j)
    r = await post({ returnDate: '2026-10-05', palletSteel: 1 })
    check('pallet steel with no steel obligation spills to unspecified (none) → 409', r.status === 409)
    r = await post({ returnDate: '2026-10-05', sackJute: 7 })
    j = await r.json()
    check('sack ปอ over typed+unspecified (2+4) → 409 naming กระสอบปอ + กระสอบไม่ระบุชนิด', r.status === 409 && /กระสอบปอ/.test(j.error) && /กระสอบไม่ระบุชนิด/.test(j.error), j)
    r = await post({ returnDate: '2026-10-05', sackPlastic: 6, sackJute: 4 })
    j = await r.json()
    check('combined sack overflow 3+2 > unspecified 4 → 409', r.status === 409, j)
    check('rejected receipts wrote nothing', (await prisma.packageReturnReceipt.count({ where: { supplierId: supplier.id } })) === 0)

    // ── valid receipt: typed + overflow to unspecified + FIFO across two box obligations ──
    r = await post({ returnDate: '2026-10-05', spoolPaper: 7, box: 5, palletWood: 1, sackJute: 3, note: 'ทดสอบ' })
    j = await r.json()
    check('valid receipt → 201', r.status === 201, j)
    const receiptId = j.data?.id as number
    check('returnDate stored as Bangkok midnight', j.data?.returnDate === '2026-10-04T17:00:00.000Z', j.data?.returnDate)
    check('emp taken from session', j.data?.emp === 'Test Runner', j.data?.emp)

    const ob = async (id: number) => prisma.packageReturnObligation.findUniqueOrThrow({ where: { id } })
    check('spool_paper fully returned', (await ob(oSpoolPaper.id)).status === 'RETURNED')
    check('overflow 2 went to spool unspecified', (await ob(oSpoolNull.id)).qtyReturned === 2)
    check('FIFO: older box obligation filled first (4/4)', (await ob(oBoxOld.id)).qtyReturned === 4 && (await ob(oBoxOld.id)).status === 'RETURNED')
    check('FIFO: newer box obligation got remainder (1/3)', (await ob(oBoxNew.id)).qtyReturned === 1 && (await ob(oBoxNew.id)).status === 'PARTIALLY_RETURNED')
    check('pallet wood 1/3', (await ob(oPalletWood.id)).qtyReturned === 1)
    check('sack ปอ fully returned (2/2)', (await ob(oSackJute.id)).status === 'RETURNED')
    check('sack ปอ overflow 1 went to sack unspecified', (await ob(oSackNull.id)).qtyReturned === 1)
    check('sack ปอ never cut from sack พลาสติก', (await ob(oSackPlastic.id)).qtyReturned === 0)
    check('receipt stores sackJute=3, sackPlastic=0', j.data?.sackJute === 3 && j.data?.sackPlastic === 0, j.data)
    const entries = await prisma.packageReturnEntry.findMany({ where: { receiptId } })
    check('entries linked to receipt, dated returnDate', entries.length === 7 && entries.every(e => e.returnedAt.toISOString() === '2026-10-04T17:00:00.000Z'), entries.length)

    s = await summary()
    check('summary updated after save', s.returned.spoolPaper === 5 && s.returned.spoolUnspecified === 2 && s.returned.box === 5 && s.outstanding.box === 2 && s.outstanding.spoolUnspecified === 6 && s.outstanding.palletWood === 2 && s.returned.sackJute === 2 && s.returned.sackUnspecified === 1 && s.returned.sackPlastic === 0 && s.outstanding.sackUnspecified === 3, { returned: s.returned, outstanding: s.outstanding })

    const list = (await (await api(`/receipts?supplierId=${supplier.id}`)).json()).data
    check('receipt history lists it with unspecifiedSpool=2, unspecifiedSack=1', list.length === 1 && list[0].id === receiptId && list[0].unspecifiedSpool === 2 && list[0].unspecifiedSack === 1 && list[0].spoolPaper === 7, list)

    // ── single-entry cancel is blocked for receipt entries ──
    r = await api(`/entries/${entries[0].id}`, { method: 'DELETE' })
    check('cancel one entry of a receipt → 409', r.status === 409)

    // ── cancel receipt ──
    r = await api(`/receipts/${receiptId}`, { method: 'DELETE' })
    check('cancel receipt → 200', r.status === 200)
    s = await summary()
    check('summary back to zero returned', Object.values(s.returned).every(v => v === 0), s.returned)
    check('obligation status reverted', (await ob(oBoxOld.id)).status === 'PENDING' && (await ob(oSpoolPaper.id)).status === 'PENDING')
    check('cancel twice → 409', (await api(`/receipts/${receiptId}`, { method: 'DELETE' })).status === 409)
    check('cancelled receipt hidden from history', (await (await api(`/receipts?supplierId=${supplier.id}`)).json()).data.length === 0)

    // ── duplicate supplier names are one company (suppliers 54/55 in real data) ──
    const twin = await prisma.supplier.create({ data: { name: supplier.name } })
    twinId = twin.id
    const oTwinBox = await prisma.packageReturnObligation.create({
      data: { sourceType: 'MATERIAL_IMPORT', materialId: material.id, supplierId: twin.id, category: 'BOX', qtyDue: 2 },
    })
    twinObligationId = oTwinBox.id
    const opts2 = (await (await api('/supplier-options')).json()).data as { id: number; name: string }[]
    check('supplier-options lists a duplicated name once', opts2.filter(o => o.name === supplier.name).length === 1)
    s = await summary()
    check('summary includes obligations of same-name supplier', s.due.box === 9, s.due.box)
    r = await post({ returnDate: '2026-10-06', box: 9 })
    check('receipt can allocate onto same-name supplier obligations', r.status === 201, await r.json())
    check('twin obligation returned', (await ob(oTwinBox.id)).status === 'RETURNED')
  } finally {
    const obligationIds = [oSpoolPaper, oSpoolNull, oPalletWood, oBoxOld, oBoxNew, oSackPlastic, oSackJute, oSackNull].map(o => o.id)
    if (twinObligationId) obligationIds.push(twinObligationId)
    await prisma.packageReturnEntry.deleteMany({ where: { obligationId: { in: obligationIds } } })
    await prisma.packageReturnReceipt.deleteMany({ where: { supplierId: { in: [supplier.id, ...(twinId ? [twinId] : [])] } } })
    await prisma.packageReturnObligation.deleteMany({ where: { id: { in: obligationIds } } })
    await prisma.material.deleteMany({ where: { id: { in: [material.id, materialJute.id] } } })
    await prisma.supplier.deleteMany({ where: { id: { in: [supplier.id, ...(twinId ? [twinId] : [])] } } })
    await prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  }

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
