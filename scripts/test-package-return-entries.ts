import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

/** /api/warehouse/package-returns isn't in middleware's public bypass list (unlike
 *  /api/warehouse/material), so requests need a real session cookie. Create a throwaway
 *  user, sign in through next-auth's credentials flow to get that cookie, delete the user after. */
async function authenticate(): Promise<{ cookie: string; userId: number }> {
  const email = `test-package-return-${Date.now()}@example.test`
  const password = 'test-password-123'
  // role: 'admin' — entries POST/DELETE now gate on 'package-returns.record' (added alongside
  // the record-return UI); permission delegation itself is covered by test-package-return-record.ts.
  const user = await prisma.user.create({
    data: { name: 'Test Runner', email, password: await bcrypt.hash(password, 10), role: 'admin' },
  })

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

async function createTestObligation(qtyDue: number) {
  const material = await prisma.material.findFirst({ where: { deletedAt: null } })
  if (!material) throw new Error('need at least one material to satisfy FK for test obligation')

  return prisma.packageReturnObligation.create({
    data: {
      sourceType: 'MATERIAL_IMPORT',
      materialId: material.id,
      category: 'BOX',
      qtyDue,
      qtyReturned: 0,
    },
  })
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
  const res = await fetch(`${BASE_URL}/api/warehouse/package-returns/entries/${entryId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })
  const json = await res.json()
  return { status: res.status, json }
}

async function main() {
  const createdObligationIds: number[] = []
  let allPass = true

  const { cookie, userId: testUserId } = await authenticate()
  console.log(`Authenticated as throwaway test user #${testUserId}\n`)

  // ── Tests 1-3: sequential partial return -> full return -> over-return rejected ──
  console.log('=== Test 1-3: sequential returns (qtyDue=10) ===')
  const obligation1 = await createTestObligation(10)
  createdObligationIds.push(obligation1.id)

  const r1 = await postEntry(cookie, obligation1.id, 6)
  console.log('return 6:', r1.status, r1.json)
  const after1 = await prisma.packageReturnObligation.findUnique({ where: { id: obligation1.id } })
  const test1Pass = r1.status === 201 && after1?.qtyReturned === 6 && after1?.status === 'PARTIALLY_RETURNED'
  console.log(test1Pass ? '✅ Test 1 PASS (qtyReturned=6, PARTIALLY_RETURNED)' : `❌ Test 1 FAIL (got qtyReturned=${after1?.qtyReturned}, status=${after1?.status})`)
  allPass &&= test1Pass

  const r2 = await postEntry(cookie, obligation1.id, 4)
  console.log('return 4 more:', r2.status, r2.json)
  const after2 = await prisma.packageReturnObligation.findUnique({ where: { id: obligation1.id } })
  const test2Pass = r2.status === 201 && after2?.qtyReturned === 10 && after2?.status === 'RETURNED'
  console.log(test2Pass ? '✅ Test 2 PASS (qtyReturned=10, RETURNED)' : `❌ Test 2 FAIL (got qtyReturned=${after2?.qtyReturned}, status=${after2?.status})`)
  allPass &&= test2Pass

  const r3 = await postEntry(cookie, obligation1.id, 1)
  console.log('return 1 more (should fail, already full):', r3.status, r3.json)
  const after3 = await prisma.packageReturnObligation.findUnique({ where: { id: obligation1.id } })
  const test3Pass = r3.status >= 400 && after3?.qtyReturned === 10 && after3?.status === 'RETURNED'
  console.log(test3Pass ? '✅ Test 3 PASS (rejected, qtyReturned unchanged at 10)' : `❌ Test 3 FAIL (status=${r3.status}, qtyReturned=${after3?.qtyReturned})`)
  allPass &&= test3Pass

  // ── Test 4: concurrent race — two requests for 6+6 against qtyDue=10, only one may succeed ──
  console.log('\n=== Test 4: concurrent race (qtyDue=10, two concurrent requests of 6) ===')
  const obligation2 = await createTestObligation(10)
  createdObligationIds.push(obligation2.id)

  const [race1, race2] = await Promise.all([
    postEntry(cookie, obligation2.id, 6),
    postEntry(cookie, obligation2.id, 6),
  ])
  console.log('race1:', race1.status, race1.json)
  console.log('race2:', race2.status, race2.json)

  const successes = [race1, race2].filter(r => r.status === 201)
  const failures = [race1, race2].filter(r => r.status >= 400)
  const after4 = await prisma.packageReturnObligation.findUnique({ where: { id: obligation2.id } })
  const test4Pass = successes.length === 1 && failures.length === 1 && after4?.qtyReturned === 6 && after4?.status === 'PARTIALLY_RETURNED'
  console.log(test4Pass
    ? '✅ Test 4 PASS (exactly one succeeded, qtyReturned=6 — no overshoot)'
    : `❌ Test 4 FAIL (successes=${successes.length}, failures=${failures.length}, qtyReturned=${after4?.qtyReturned})`)
  allPass &&= test4Pass

  const winningEntryId = successes[0]?.json?.data?.id as number | undefined

  // ── Test 5: cancel an entry, verify reversal ──
  console.log('\n=== Test 5: cancel entry ===')
  if (!winningEntryId) {
    console.log('❌ Test 5 SKIPPED (no winning entry from test 4 to cancel)')
    allPass = false
  } else {
    const cancelRes = await deleteEntry(cookie, winningEntryId)
    console.log('cancel result:', cancelRes.status, cancelRes.json)
    const after5 = await prisma.packageReturnObligation.findUnique({ where: { id: obligation2.id } })
    const test5Pass = cancelRes.status === 200 && after5?.qtyReturned === 0 && after5?.status === 'PENDING'
    console.log(test5Pass
      ? '✅ Test 5 PASS (qtyReturned=0, status back to PENDING)'
      : `❌ Test 5 FAIL (qtyReturned=${after5?.qtyReturned}, status=${after5?.status})`)
    allPass &&= test5Pass

    // bonus: cancelling the same entry twice must be rejected
    const cancelAgain = await deleteEntry(cookie, winningEntryId)
    const doubleCancelRejected = cancelAgain.status >= 400
    console.log(doubleCancelRejected ? '✅ double-cancel correctly rejected' : '❌ double-cancel incorrectly succeeded')
    allPass &&= doubleCancelRejected
  }

  // ── Cleanup ──
  console.log('\n=== Cleanup ===')
  await prisma.packageReturnEntry.deleteMany({ where: { obligationId: { in: createdObligationIds } } })
  await prisma.packageReturnObligation.deleteMany({ where: { id: { in: createdObligationIds } } })
  await prisma.user.delete({ where: { id: testUserId } })
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
