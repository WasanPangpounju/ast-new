import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

/** NavLinks.tsx keeps its own hardcoded sidebar list, separate from menus.ts's ALL_MENUS —
 *  a menuKey can exist in one and not the other (this happened once already for
 *  needs-supplier, and again for package-returns.record). The only way to actually verify
 *  the sidebar shows a link is to render a real dashboard page server-side and check the
 *  HTML, since allowedMenuKeys is computed in (dashboard)/layout.tsx with no API of its own. */
async function authenticate(opts: { menuKeys?: string[] } = {}): Promise<{ cookie: string; userId: number }> {
  const email = `test-navlink-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
  const password = 'test-password-123'
  const user = await prisma.user.create({
    data: { name: 'Test Runner', email, password: await bcrypt.hash(password, 10), role: 'user' },
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

/** NavLinks' accordion only renders a group's children into the DOM when that group is
 *  "open", and it auto-opens only when the current pathname matches one of the group's
 *  (unfiltered) child hrefs. So fetching "/" would never reveal any sidebar links regardless
 *  of permissions — the request path has to be a page inside the group we're checking. */
async function fetchHtml(path: string, cookie: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } })
  if (!res.ok) throw new Error(`Fetch ${path} failed with status ${res.status}`)
  return res.text()
}

async function main() {
  const createdUserIds: number[] = []
  let allPass = true

  const RECORD_HREF = 'href="/warehouse/package-returns"'
  const RECORD_LABEL = 'บันทึกคืนบรรจุภัณฑ์'
  const ASSIGN_HREF = 'href="/warehouse/package-returns/needs-supplier"'
  const ASSIGN_LABEL = 'มอบหมายซัพพลายเออร์คืนบรรจุภัณฑ์'

  // ── Test 1: user granted only package-returns.record sees the link (fetch the page
  // itself so the "ระบบวัตถุดิบ" accordion group auto-opens for this pathname) ──
  console.log('=== Test 1: user granted package-returns.record sees the sidebar link ===')
  const { cookie: grantedCookie, userId: grantedUserId } = await authenticate({ menuKeys: ['package-returns.record'] })
  createdUserIds.push(grantedUserId)

  const htmlGranted = await fetchHtml('/warehouse/package-returns', grantedCookie)
  const test1Pass = htmlGranted.includes(RECORD_HREF) && htmlGranted.includes(RECORD_LABEL)
  console.log(test1Pass
    ? '✅ Test 1 PASS (link + label present in rendered sidebar HTML)'
    : `❌ Test 1 FAIL (hasHref=${htmlGranted.includes(RECORD_HREF)}, hasLabel=${htmlGranted.includes(RECORD_LABEL)})`)
  allPass &&= test1Pass

  // ── Test 2: user granted only package-returns.assign-supplier sees THAT link, but not
  // the record link — proves per-menuKey filtering inside an already-open group, not just
  // "the whole group is visible or not" ──
  console.log('\n=== Test 2: user granted only package-returns.assign-supplier sees that link but not the record link ===')
  const { cookie: otherCookie, userId: otherUserId } = await authenticate({ menuKeys: ['package-returns.assign-supplier'] })
  createdUserIds.push(otherUserId)

  const htmlOther = await fetchHtml('/warehouse/package-returns/needs-supplier', otherCookie)
  const test2Pass = htmlOther.includes(ASSIGN_HREF) && htmlOther.includes(ASSIGN_LABEL)
    && !htmlOther.includes(RECORD_HREF) && !htmlOther.includes(RECORD_LABEL)
  console.log(test2Pass
    ? '✅ Test 2 PASS (assign-supplier link shown, record link correctly absent)'
    : `❌ Test 2 FAIL (hasAssignHref=${htmlOther.includes(ASSIGN_HREF)}, hasRecordHref=${htmlOther.includes(RECORD_HREF)})`)
  allPass &&= test2Pass

  // ── Test 3: user with no permissions at all is redirected away from the record page,
  // and never sees the link on wherever they land ──
  console.log('\n=== Test 3: user with zero permissions is redirected away and never sees the record link ===')
  const { cookie: noPermCookie, userId: noPermUserId } = await authenticate({})
  createdUserIds.push(noPermUserId)

  const res = await fetch(`${BASE_URL}/warehouse/package-returns`, { headers: { Cookie: noPermCookie } })
  const htmlNoPerm = await res.text()
  const wasRedirectedAway = res.url !== `${BASE_URL}/warehouse/package-returns`
  const test3Pass = wasRedirectedAway && !htmlNoPerm.includes(RECORD_HREF) && !htmlNoPerm.includes(RECORD_LABEL)
  console.log(test3Pass
    ? '✅ Test 3 PASS (redirected away from the page, record link absent wherever they landed)'
    : `❌ Test 3 FAIL (redirected=${wasRedirectedAway}, finalUrl=${res.url})`)
  allPass &&= test3Pass

  // ── Cleanup ──
  console.log('\n=== Cleanup ===')
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
