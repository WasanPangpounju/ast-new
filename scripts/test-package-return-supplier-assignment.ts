import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const MENU_KEY = 'package-returns.assign-supplier'

/** /api/warehouse/package-returns isn't in middleware's public bypass list (unlike
 *  /api/warehouse/material), so requests need a real session cookie. Create a throwaway
 *  user (optionally with a role and/or granted menuKeys), sign in through next-auth's
 *  credentials flow to get that cookie, delete the user after. */
async function authenticate(opts: { role?: string; menuKeys?: string[] } = {}): Promise<{ cookie: string; userId: number }> {
  const email = `test-supplier-assign-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

async function createTestObligation() {
  const material = await prisma.material.findFirst({ where: { deletedAt: null } })
  if (!material) throw new Error('need at least one material to satisfy FK for test obligation')

  return prisma.packageReturnObligation.create({
    data: {
      sourceType: 'MATERIAL_IMPORT',
      materialId: material.id,
      category: 'BOX',
      qtyDue: 5,
      qtyReturned: 0,
      supplierId: null,
      needsSupplierAssignment: true,
    },
  })
}

async function getNeedsSupplierList(cookie: string) {
  const res = await fetch(`${BASE_URL}/api/warehouse/package-returns/obligations/needs-supplier`, {
    headers: { Cookie: cookie },
  })
  const json = await res.json()
  return { status: res.status, json }
}

async function assignSupplier(cookie: string, obligationId: number, supplierId: number) {
  const res = await fetch(`${BASE_URL}/api/warehouse/package-returns/obligations/${obligationId}/supplier`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ supplierId }),
  })
  const json = await res.json()
  return { status: res.status, json }
}

async function main() {
  const createdObligationIds: number[] = []
  const createdUserIds: number[] = []
  let allPass = true

  // Admin session — used for tests 1-4, same as before this endpoint had permission checks.
  const { cookie, userId: adminUserId } = await authenticate({ role: 'admin' })
  createdUserIds.push(adminUserId)
  console.log(`Authenticated as throwaway admin user #${adminUserId}\n`)

  const supplier = await prisma.supplier.findFirst({ where: { deletedAt: null } })
  if (!supplier) throw new Error('No supplier found in DB — cannot run this test')

  // ── Test 1: created obligation shows up in the needs-supplier queue ──
  console.log('=== Test 1: obligation appears in needs-supplier list (admin) ===')
  const obligation = await createTestObligation()
  createdObligationIds.push(obligation.id)

  const list1 = await getNeedsSupplierList(cookie)
  const foundInList1 = (list1.json.data as Array<{ id: number }>).some(o => o.id === obligation.id)
  const test1Pass = list1.status === 200 && foundInList1
  console.log(test1Pass ? '✅ Test 1 PASS (obligation found in queue)' : `❌ Test 1 FAIL (status=${list1.status}, found=${foundInList1})`)
  allPass &&= test1Pass

  // ── Test 2: assign a real supplier — obligation updated and removed from queue ──
  console.log('\n=== Test 2: assign supplier (admin) ===')
  const assignRes = await assignSupplier(cookie, obligation.id, supplier.id)
  console.log('assign response:', assignRes.status, assignRes.json)
  const afterAssign = await prisma.packageReturnObligation.findUnique({ where: { id: obligation.id } })
  const assignedOk = assignRes.status === 200
    && afterAssign?.supplierId === supplier.id
    && afterAssign?.needsSupplierAssignment === false

  const list2 = await getNeedsSupplierList(cookie)
  const stillInList2 = (list2.json.data as Array<{ id: number }>).some(o => o.id === obligation.id)
  const test2Pass = assignedOk && !stillInList2
  console.log(test2Pass
    ? '✅ Test 2 PASS (supplierId set, needsSupplierAssignment=false, removed from queue)'
    : `❌ Test 2 FAIL (supplierId=${afterAssign?.supplierId}, needsSupplierAssignment=${afterAssign?.needsSupplierAssignment}, stillInList=${stillInList2})`)
  allPass &&= test2Pass

  // ── Test 3: re-assigning the same obligation is rejected ──
  console.log('\n=== Test 3: re-assign rejected (admin) ===')
  const reassignRes = await assignSupplier(cookie, obligation.id, supplier.id)
  console.log('re-assign response:', reassignRes.status, reassignRes.json)
  const test3Pass = reassignRes.status >= 400
  console.log(test3Pass ? '✅ Test 3 PASS (re-assign rejected)' : '❌ Test 3 FAIL (re-assign incorrectly succeeded)')
  allPass &&= test3Pass

  // ── Test 4: assigning a non-existent supplierId is rejected ──
  console.log('\n=== Test 4: unknown supplierId rejected (admin) ===')
  const obligation2 = await createTestObligation()
  createdObligationIds.push(obligation2.id)
  const bogusSupplierId = 999999999
  const badAssignRes = await assignSupplier(cookie, obligation2.id, bogusSupplierId)
  console.log('bad-supplier assign response:', badAssignRes.status, badAssignRes.json)
  const afterBad = await prisma.packageReturnObligation.findUnique({ where: { id: obligation2.id } })
  const test4Pass = badAssignRes.status >= 400
    && afterBad?.supplierId === null
    && afterBad?.needsSupplierAssignment === true
  console.log(test4Pass ? '✅ Test 4 PASS (unknown supplierId rejected, obligation unchanged)' : '❌ Test 4 FAIL')
  allPass &&= test4Pass

  // ── Test 5: plain user with NO permission on this menuKey → 403 on both endpoints ──
  console.log('\n=== Test 5: user without permission gets 403 ===')
  const { cookie: noPermCookie, userId: noPermUserId } = await authenticate({ role: 'user' })
  createdUserIds.push(noPermUserId)

  const obligation3 = await createTestObligation()
  createdObligationIds.push(obligation3.id)

  const list5 = await getNeedsSupplierList(noPermCookie)
  const assign5 = await assignSupplier(noPermCookie, obligation3.id, supplier.id)
  const afterDenied = await prisma.packageReturnObligation.findUnique({ where: { id: obligation3.id } })
  const test5Pass = list5.status === 403
    && assign5.status === 403
    && afterDenied?.supplierId === null
    && afterDenied?.needsSupplierAssignment === true
  console.log(`GET status=${list5.status}, PATCH status=${assign5.status}`)
  console.log(test5Pass
    ? '✅ Test 5 PASS (no-permission user rejected with 403 on both endpoints, obligation untouched)'
    : '❌ Test 5 FAIL')
  allPass &&= test5Pass

  // ── Test 6: non-admin user GRANTED this menuKey → works normally (proves delegation) ──
  console.log('\n=== Test 6: non-admin user granted the menuKey succeeds ===')
  const { cookie: grantedCookie, userId: grantedUserId } = await authenticate({ role: 'user', menuKeys: [MENU_KEY] })
  createdUserIds.push(grantedUserId)

  const obligation4 = await createTestObligation()
  createdObligationIds.push(obligation4.id)

  const list6 = await getNeedsSupplierList(grantedCookie)
  const foundInList6 = (list6.json.data as Array<{ id: number }>).some(o => o.id === obligation4.id)
  const assign6 = await assignSupplier(grantedCookie, obligation4.id, supplier.id)
  const afterGranted = await prisma.packageReturnObligation.findUnique({ where: { id: obligation4.id } })
  const test6Pass = list6.status === 200
    && foundInList6
    && assign6.status === 200
    && afterGranted?.supplierId === supplier.id
    && afterGranted?.needsSupplierAssignment === false
  console.log(`GET status=${list6.status}, PATCH status=${assign6.status}`)
  console.log(test6Pass
    ? '✅ Test 6 PASS (staff granted menuKey by admin can use both endpoints, not admin-only)'
    : '❌ Test 6 FAIL')
  allPass &&= test6Pass

  // ── Cleanup ──
  console.log('\n=== Cleanup ===')
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
