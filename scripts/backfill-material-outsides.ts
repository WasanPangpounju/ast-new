/**
 * backfill-material-outsides.ts  (ONE-TIME backfill, not part of sync-from-mysql.ts)
 *
 * Legacy MySQL `material_outsides` (164 rows) was never migrated into Postgres
 * `material_outsides` — sync-from-mysql.ts wrongly treated it as "PG-only".
 * This script backfills it once, matching materialId best-effort via
 * lot|yarnType|supplierName against the current `materials` table (legacy
 * material_outsides never had a materialId FK to begin with).
 *
 * Idempotent: preserves the legacy MySQL `id` as the Postgres `id`, and uses
 * `skipDuplicates: true` on insert — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-material-outsides.ts             (dry-run, default)
 *   npx tsx scripts/backfill-material-outsides.ts --apply     (writes to Postgres)
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

const APPLY = process.argv.includes('--apply')

function f(v: any): number | null {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}
function i(v: any): number {
  const n = parseInt(v)
  return isNaN(n) ? 0 : n
}
function s(v: any): string | null {
  return v != null && v !== '' ? String(v) : null
}

async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  console.log(APPLY ? '⚠️  APPLY MODE — จะเขียนข้อมูลจริงลง Postgres\n' : '🔍 DRY RUN — จะไม่เขียนอะไรลง Postgres\n')

  const db = await mysql.createConnection(mysqlUrl)
  const [legacyRows]: any = await db.query(`SELECT * FROM material_outsides ORDER BY id`)
  await db.end()
  console.log(`legacy material_outsides: ${legacyRows.length} rows\n`)

  // Build materialId lookup from *current* Postgres materials (not MySQL),
  // same best-effort key as the materialRequisitions backfill in sync-from-mysql.ts.
  const materials = await prisma.material.findMany({
    where: { deletedAt: null },
    select: { id: true, lot: true, yarnType: true, supplierName: true, createdAt: true },
    orderBy: { createdAt: 'asc' }, // later rows overwrite earlier ones in the map = "most recent" wins, like the live form's findFirst(desc)
  })
  const matLookup = new Map<string, number>()
  for (const m of materials) {
    const key = `${m.lot ?? ''}|${m.yarnType ?? ''}|${m.supplierName ?? ''}`
    matLookup.set(key, m.id)
  }

  const matched: any[] = []
  const unmatched: any[] = []

  const transformed = legacyRows.map((r: any) => {
    const key = `${r.lot ?? ''}|${r.yarnType ?? ''}|${r.supplierName ?? ''}`
    const materialId = matLookup.get(key) ?? null
    if (materialId) matched.push(r); else unmatched.push(r)

    const legacyExtras: string[] = []
    if (s(r.emp))   legacyExtras.push(`emp=${r.emp}`)
    if (i(r.pallet) > 0) legacyExtras.push(`pallet=${r.pallet}`)
    if (i(r.box)    > 0) legacyExtras.push(`box=${r.box}`)
    if (i(r.sack)   > 0) legacyExtras.push(`sack=${r.sack}`)
    const note = [s(r.comment), legacyExtras.length ? `[legacy] ${legacyExtras.join(', ')}` : null]
      .filter(Boolean)
      .join(' ')

    const base = {
      id:              Number(r.id),
      withdrawId:      `LEGACY-MO-${r.id}`,
      lot:             s(r.lot),
      yarnType:        r.yarnType ?? '',
      supplierName:    s(r.supplierName),
      spool:           i(r.spool),
      weightWithdrawn: f(r.weight_kg_net) ?? f(r.weight_kg_sum) ?? 0,
      weightPSum:      f(r.weight_p_sum),
      weightKgSum:     f(r.weight_kg_sum),
      weightPPackage:  f(r.weight_p_package),
      weightKgPackage: f(r.weight_kg_package),
      averageP:        f(r.average_p),
      averageKg:       f(r.average_kg),
      note:            note || null,
      recipient:       s(r.recipient),
      paymentComment:  s(r.paymentComment),
      createdAt:       r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt:       r.updated_at ? new Date(r.updated_at) : new Date(),
    }
    return materialId !== null ? { ...base, materialId } : base
  })

  console.log(`matched materialId:   ${matched.length}`)
  console.log(`unmatched materialId: ${unmatched.length} (still imported, materialId=null)\n`)

  console.log('=== ตัวอย่าง 5 แถวแรก (แปลงแล้ว) ===')
  for (const row of transformed.slice(0, 5)) {
    console.log(row)
  }

  if (unmatched.length > 0) {
    console.log('\n=== แถวที่ map materialId ไม่ได้ (ทั้งหมด) ===')
    for (const r of unmatched) {
      console.log(`  id=${r.id}  lot="${r.lot}"  yarnType="${r.yarnType}"  supplierName="${r.supplierName}"`)
    }
  }

  // Check how many are already present (idempotency check for reporting)
  const existingIds = await prisma.materialOutside.findMany({
    where: { id: { in: transformed.map((t: any) => t.id) } },
    select: { id: true },
  })
  const existingIdSet = new Set(existingIds.map((e) => e.id))
  const toInsert = transformed.filter((t: any) => !existingIdSet.has(t.id))
  console.log(`\nแถวที่มีอยู่แล้วใน Postgres (จะถูกข้าม): ${existingIdSet.size}`)
  console.log(`แถวที่จะ insert จริง: ${toInsert.length}`)

  if (!APPLY) {
    console.log('\n✅ Dry run เสร็จ — ไม่มีการแก้ไขข้อมูลใน PostgreSQL (รันด้วย --apply เพื่อเขียนจริง)')
    await prisma.$disconnect()
    return
  }

  console.log('\n📝 กำลัง insert...')
  const result = await prisma.materialOutside.createMany({
    data: toInsert,
    skipDuplicates: true,
  })
  console.log(`  ✓ insert แล้ว ${result.count} แถว`)

  console.log('🔢 Resetting sequence for material_outsides...')
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"material_outsides"', 'id'),
      COALESCE((SELECT MAX("id") FROM "material_outsides"), 1)
    )
  `)
  console.log('  ✓ sequence reset')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
