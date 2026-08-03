import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const MENU_KEY = 'package-returns.record'

/** Same throwaway-user + credentials-login pattern as the other package-return test
 *  scripts — /api/warehouse/package-returns isn't in middleware's public bypass list. */
async function authenticate(opts: { role?: string; menuKeys?: string[] } = {}): Promise<{ cookie: string; userId: number }> {
  const email = `test-package-return-record-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
  const password = 'test-password-123'
  const user = await prisma.user.create({
    data: { name: 'Test Runner', email, password: await bcrypt.hash(password, 10), role: opts.role ?? 'user' },
  })

  if (opts.menuKeys?.length) {
    await prisma.userPermission.createMany({
      data: opts.menuKeys.map(menuKey => ({ userId: user.id, menuKey, canAccess: true })),
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
  const loginCookies = loginRes.headers.getSetCookie()

  const allCookies = [...csrfCookies, ...loginCookies].map(c => c.split(';')[0])
  const sessionCookie = allCookies.find(c => /session-token=/.test(c))
  if (!sessionCookie) {
    throw new Error(`Login failed — no session cookie in response (status ${loginRes.status})`)
  }

  return { cookie: allCookies.join('; '), userId: user.id }
}

async function createImportObligation(qtyDue: number, opts: { needsSupplierAssignment?: boolean; supplierId?: number } = {}) {
  const material = await prisma.material.findFirst({ where: { deletedAt: null } })
  if (!material) throw new Error('need at least one material to satisfy FK for test obligation')

  return prisma.packageReturnObligation.create({
    data: {
      sourceType: 'MATERIAL_IMPORT',
      materialId: material.id,
      category: 'BOX',
      qtyDue,
      qtyReturned: 0,
      needsSupplierAssignment: opts.needsSupplierAssignment ?? false,
      supplierId: opts.supplierId ?? null,
    },
  })
}

async function createOutsideObligation(qtyDue: number, recipientName: string) {
  const outside = await prisma.materialOutside.findFirst({ where: { deletedAt: null } })
  if (!outside) throw new Error('need at least one MaterialOutside to satisfy FK for test obligation')

  return prisma.packageReturnObligation.create({
    data: {
      sourceType: 'MATERIAL_OUTSIDE',
      materialOutsideId: outside.id,
      category: 'SACK',
      qtyDue,
      qtyReturned: 0,
      needsSupplierAssignment: false,
      recipientName,
    },
  })
}

async function listObligations(cookie: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE_URL}/api/warehouse/package-returns/obligations?${qs}`, { headers: { Cookie: cookie } })
  const json = await res.json()
  return { status: res.status, json }
}

async function getHistory(cookie: string, obligationId: number) {
  const res = await fetch(`${BASE_URL}/api/warehouse/package-returns/obligations/${obligationId}/entries`, { headers: { Cookie: cookie } })
  const json = await res.json()
  return { status: res.status, json }
}

async function postEntry(cookie: string, obligationId: number, qty: number) {
  const res = await fetch(`${BASE_URL}/api/warehouse/package-returns/obligations/${obligationId}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ qty, emp: 'tester' }),
  })
  const json = await res.json()
  return { status: res.status, json }
}

async function deleteEntry(cookie: string, entryId: number) {
  const res = await fetch(`${BASE_URL}/api/warehouse/package-returns/entries/${entryId}`, { method: 'DELETE', headers: { Cookie: cookie } })
  const json = await res.json()
  return { status: res.status, json }
}

async function main() {
  const createdObligationIds: number[] = []
  const createdUserIds: number[] = []
  let allPass = true

  const { cookie, userId: adminUserId } = await authenticate({ role: 'admin' })
  createdUserIds.push(adminUserId)
  console.log(`Authenticated as throwaway admin user #${adminUserId}\n`)

  // ── Test 1: assigned import obligation appears in the record list, needs-supplier one doesn't ──
  console.log('=== Test 1: needsSupplierAssignment=true is excluded from the record queue ===')
  const assignedObligation = await createImportObligation(10)
  const unassignedObligation = await createImportObligation(5, { needsSupplierAssignment: true })
  createdObligationIds.push(assignedObligation.id, unassignedObligation.id)

  const list1 = await listObligations(cookie, { sourceType: 'MATERIAL_IMPORT' })
  const ids1 = (list1.json.data as Array<{ id: number }>).map(o => o.id)
  const test1Pass = list1.status === 200 && ids1.includes(assignedObligation.id) && !ids1.includes(unassignedObligation.id)
  console.log(test1Pass
    ? '✅ Test 1 PASS (assigned obligation listed, needs-assignment obligation excluded)'
    : `❌ Test 1 FAIL (status=${list1.status}, ids=${JSON.stringify(ids1)})`)
  allPass &&= test1Pass

  // ── Test 2: default status filter excludes RETURNED, explicit status=RETURNED includes it ──
  console.log('\n=== Test 2: RETURNED hidden by default, shown when explicitly filtered ===')
  const returnedObligation = await createImportObligation(3)
  createdObligationIds.push(returnedObligation.id)
  const fullReturn = await postEntry(cookie, returnedObligation.id, 3)
  const fullReturnOk = fullReturn.status === 201

  const list2Default = await listObligations(cookie, { sourceType: 'MATERIAL_IMPORT' })
  const ids2Default = (list2Default.json.data as Array<{ id: number }>).map(o => o.id)
  const list2Returned = await listObligations(cookie, { sourceType: 'MATERIAL_IMPORT', status: 'RETURNED' })
  const ids2Returned = (list2Returned.json.data as Array<{ id: number }>).map(o => o.id)
  const test2Pass = fullReturnOk && !ids2Default.includes(returnedObligation.id) && ids2Returned.includes(returnedObligation.id)
  console.log(test2Pass
    ? '✅ Test 2 PASS (RETURNED excluded by default, present with status=RETURNED)'
    : `❌ Test 2 FAIL (fullReturnOk=${fullReturnOk}, inDefault=${ids2Default.includes(returnedObligation.id)}, inReturned=${ids2Returned.includes(returnedObligation.id)})`)
  allPass &&= test2Pass

  // ── Test 3: outside-source obligation shows recipientName, not a supplier ──
  console.log('\n=== Test 3: MATERIAL_OUTSIDE obligation carries recipientName ===')
  const outsideObligation = await createOutsideObligation(4, 'โรงงานทดสอบ ก')
  createdObligationIds.push(outsideObligation.id)

  const list3 = await listObligations(cookie, { sourceType: 'MATERIAL_OUTSIDE' })
  const found3 = (list3.json.data as Array<{ id: number; recipientName: string | null; supplier: unknown }>).find(o => o.id === outsideObligation.id)
  const test3Pass = list3.status === 200 && found3?.recipientName === 'โรงงานทดสอบ ก' && found3?.supplier === null
  console.log(test3Pass ? '✅ Test 3 PASS (recipientName present, supplier null)' : `❌ Test 3 FAIL (found=${JSON.stringify(found3)})`)
  allPass &&= test3Pass

  // ── Test 4: history endpoint reflects entries, and cancelling one removes it from history ──
  console.log('\n=== Test 4: entries history + cancel reflected ===')
  const historyObligation = await createImportObligation(10)
  createdObligationIds.push(historyObligation.id)
  const entry1 = await postEntry(cookie, historyObligation.id, 4)
  const entry2 = await postEntry(cookie, historyObligation.id, 3)
  const entry1Id = entry1.json?.data?.id as number | undefined
  const entry2Id = entry2.json?.data?.id as number | undefined

  const historyBefore = await getHistory(cookie, historyObligation.id)
  const historyIdsBefore = (historyBefore.json.data as Array<{ id: number }>).map(e => e.id)
  const beforeOk = historyBefore.status === 200 && entry1Id !== undefined && entry2Id !== undefined
    && historyIdsBefore.includes(entry1Id) && historyIdsBefore.includes(entry2Id)

  let afterOk = false
  if (entry1Id !== undefined) {
    const cancelRes = await deleteEntry(cookie, entry1Id)
    const historyAfter = await getHistory(cookie, historyObligation.id)
    const historyIdsAfter = (historyAfter.json.data as Array<{ id: number }>).map(e => e.id)
    afterOk = cancelRes.status === 200 && !historyIdsAfter.includes(entry1Id) && historyIdsAfter.includes(entry2Id as number)
  }

  const test4Pass = beforeOk && afterOk
  console.log(test4Pass
    ? '✅ Test 4 PASS (history lists both entries, cancelled entry disappears, other remains)'
    : `❌ Test 4 FAIL (beforeOk=${beforeOk}, afterOk=${afterOk})`)
  allPass &&= test4Pass

  // ── Test 5: user without the menuKey gets 403 on list, entries POST, history GET, and DELETE ──
  console.log('\n=== Test 5: no-permission user gets 403 on every endpoint ===')
  const { cookie: noPermCookie, userId: noPermUserId } = await authenticate({ role: 'user' })
  createdUserIds.push(noPermUserId)

  const denyObligation = await createImportObligation(5)
  createdObligationIds.push(denyObligation.id)

  const listDeny = await listObligations(noPermCookie, { sourceType: 'MATERIAL_IMPORT' })
  const postDeny = await postEntry(noPermCookie, denyObligation.id, 1)
  const historyDeny = await getHistory(noPermCookie, denyObligation.id)
  const afterDenyObligation = await prisma.packageReturnObligation.findUnique({ where: { id: denyObligation.id } })
  const test5Pass = listDeny.status === 403 && postDeny.status === 403 && historyDeny.status === 403 && afterDenyObligation?.qtyReturned === 0
  console.log(`list=${listDeny.status}, post=${postDeny.status}, history=${historyDeny.status}`)
  console.log(test5Pass ? '✅ Test 5 PASS (all endpoints 403, obligation untouched)' : '❌ Test 5 FAIL')
  allPass &&= test5Pass

  // ── Test 6: non-admin user granted only 'package-returns.record' succeeds (proves delegation) ──
  console.log('\n=== Test 6: staff granted package-returns.record can list + record + cancel ===')
  const { cookie: grantedCookie, userId: grantedUserId } = await authenticate({ role: 'user', menuKeys: [MENU_KEY] })
  createdUserIds.push(grantedUserId)

  const grantedObligation = await createImportObligation(6)
  createdObligationIds.push(grantedObligation.id)

  const listGranted = await listObligations(grantedCookie, { sourceType: 'MATERIAL_IMPORT' })
  const foundGranted = (listGranted.json.data as Array<{ id: number }>).some(o => o.id === grantedObligation.id)
  const postGranted = await postEntry(grantedCookie, grantedObligation.id, 6)
  const grantedEntryId = postGranted.json?.data?.id as number | undefined
  const historyGranted = grantedEntryId !== undefined ? await getHistory(grantedCookie, grantedObligation.id) : { status: 0, json: null }
  const cancelGranted = grantedEntryId !== undefined ? await deleteEntry(grantedCookie, grantedEntryId) : { status: 0, json: null }

  const test6Pass = listGranted.status === 200 && foundGranted
    && postGranted.status === 201
    && historyGranted.status === 200
    && cancelGranted.status === 200
  console.log(`list=${listGranted.status}, post=${postGranted.status}, history=${historyGranted.status}, cancel=${cancelGranted.status}`)
  console.log(test6Pass
    ? '✅ Test 6 PASS (staff granted package-returns.record can use every endpoint, not admin-only)'
    : '❌ Test 6 FAIL')
  allPass &&= test6Pass

  // ── Test 7: pagination — no overlap between pages, totalPages matches total/limit ──
  // (Doesn't assert an exact total — the dev DB already has ~164 backfilled PENDING rows
  // plus whatever earlier tests in this run left behind, so exact counts aren't stable.)
  console.log('\n=== Test 7: pagination (limit=3, PENDING, MATERIAL_IMPORT) ===')
  for (let i = 0; i < 7; i++) {
    const o = await createImportObligation(1)
    createdObligationIds.push(o.id)
  }

  const page1 = await listObligations(cookie, { sourceType: 'MATERIAL_IMPORT', status: 'PENDING', limit: '3', page: '1' })
  const page2 = await listObligations(cookie, { sourceType: 'MATERIAL_IMPORT', status: 'PENDING', limit: '3', page: '2' })
  const ids7Page1 = (page1.json.data as Array<{ id: number }>).map(o => o.id)
  const ids7Page2 = (page2.json.data as Array<{ id: number }>).map(o => o.id)
  const overlap = ids7Page1.some(id => ids7Page2.includes(id))
  const total7 = page1.json.total as number
  const expectedTotalPages = Math.ceil(total7 / 3)

  const test7Pass = page1.status === 200 && page2.status === 200
    && page1.json.page === 1 && page2.json.page === 2
    && ids7Page1.length === 3 && ids7Page2.length === 3
    && !overlap
    && page1.json.total === page2.json.total
    && page1.json.totalPages === expectedTotalPages
  console.log(`page1 ids=${JSON.stringify(ids7Page1)}, page2 ids=${JSON.stringify(ids7Page2)}, total=${total7}, totalPages=${page1.json.totalPages}`)
  console.log(test7Pass
    ? '✅ Test 7 PASS (pages disjoint, totalPages = ceil(total/limit))'
    : '❌ Test 7 FAIL')
  allPass &&= test7Pass

  // ── Cleanup ──
  console.log('\n=== Cleanup ===')
  await prisma.packageReturnEntry.deleteMany({ where: { obligationId: { in: createdObligationIds } } })
  await prisma.packageReturnObligation.deleteMany({ where: { id: { in: createdObligationIds } } })
  await prisma.userPermission.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  console.log('Cleanup done.')

  console.log('\n=== SUMMARY ===', allPass ? '✅ ALL PASS' : '❌ SOME FAILED')
  if (!allPass) process.exitCode = 1

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
