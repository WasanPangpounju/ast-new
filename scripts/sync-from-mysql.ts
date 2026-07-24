/**
 * sync-from-mysql.ts
 *
 * Full sync: ดึงข้อมูลจาก MySQL (Laravel) มาแทนที่ PostgreSQL ใหม่ทั้งหมด
 * - TRUNCATE ทุกตารางก่อน (เรียง FK dependency ถูกต้อง)
 * - INSERT batch ใหม่จาก MySQL
 * - ไม่ใช้ upsert → ข้อมูลใน PG ตรงกับ MySQL เสมอ
 *
 * ใช้งาน:
 *   npx tsx scripts/sync-from-mysql.ts
 *   npx tsx scripts/sync-from-mysql.ts --dry-run   (แสดงจำนวนแถวที่จะ sync โดยไม่แตะ PG)
 *   npx tsx scripts/sync-from-mysql.ts --tables customers,suppliers (sync เฉพาะบางตาราง)
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ONLY_TABLES = args
  .find(a => a.startsWith('--tables='))
  ?.replace('--tables=', '')
  .split(',')
  .map(s => s.trim()) ?? []

const BATCH = 300

// ── Helpers ─────────────────────────────────────────────────────────────────
function d(v: any): Date {
  return v ? new Date(v) : new Date()
}
function f(v: any): number | null {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}
function i(v: any): number | null {
  const n = parseInt(v)
  return isNaN(n) ? null : n
}
function s(v: any): string | null {
  return v != null && v !== '' ? String(v) : null
}

function should(table: string) {
  return ONLY_TABLES.length === 0 || ONLY_TABLES.includes(table)
}

async function insertBatch<T>(
  label: string,
  rows: T[],
  fn: (batch: T[]) => Promise<{ count: number }>,
) {
  if (DRY_RUN) { console.log(`  [dry-run] ${label}: ${rows.length} rows`); return }
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await fn(batch)
    done += batch.length
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}...`)
  }
  console.log(`\r  ✓ ${label}: ${rows.length} rows`)
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  console.log(DRY_RUN ? '🔍 DRY RUN — PG จะไม่ถูกแก้ไข\n' : '🔄 เริ่ม sync MySQL → PostgreSQL\n')

  const db = await mysql.createConnection(mysqlUrl)
  console.log('✅ เชื่อมต่อ MySQL สำเร็จ\n')

  // ── 1. Pull ข้อมูลทั้งหมดจาก MySQL ก่อน ─────────────────────────────────
  console.log('📥 ดึงข้อมูลจาก MySQL...')

  const [customers]:     any = await db.query('SELECT * FROM customers')
  const [coordinators]:  any = await db.query('SELECT * FROM coordinators')
  const [suppliers]:     any = await db.query('SELECT * FROM suppliers')
  const [orders]:        any = await db.query('SELECT * FROM ast_purchaseorders ORDER BY id ASC')
  const [structs]:       any = await db.query('SELECT * FROM fabric_aststructures')
  const [fabricAsts]:    any = await db.query('SELECT * FROM fabric_asts')
  const [stocks]:        any = await db.query('SELECT * FROM stockfabrics ORDER BY id ASC')
  const [fouts]:         any = await db.query('SELECT * FROM fabricouts ORDER BY id ASC')
  const [empMaterials]:  any = await db.query('SELECT * FROM empmaterials')
  const [materials]:     any = await db.query('SELECT * FROM materials ORDER BY id ASC')
  const [materialStores]: any = await db.query('SELECT * FROM materialstores ORDER BY id ASC')

  // สร้าง map: order.id → purchaseOrder (string) สำหรับ FK resolve
  const idToPo = new Map<number, string>(
    orders.map((o: any) => [Number(o.id), String(o.purchaseOrder)])
  )

  console.log(`  customers:      ${customers.length}`)
  console.log(`  coordinators:   ${coordinators.length}`)
  console.log(`  suppliers:      ${suppliers.length}`)
  console.log(`  orders:         ${orders.length}`)
  console.log(`  structures:     ${structs.length}`)
  console.log(`  fabricAsts:     ${fabricAsts.length}`)
  console.log(`  stockFabrics:   ${stocks.length}`)
  console.log(`  fabricOuts:     ${fouts.length}`)
  console.log(`  empMaterials:   ${empMaterials.length}`)
  console.log(`  materials:      ${materials.length}`)
  console.log(`  materialStores: ${materialStores.length}`)
  console.log('')

  if (DRY_RUN) {
    console.log('✅ Dry run เสร็จ — ไม่มีการแก้ไขข้อมูลใน PostgreSQL')
    await db.end()
    await prisma.$disconnect()
    return
  }

  // ── 2. TRUNCATE — full หรือ targeted ขึ้นกับ --tables flag ───────────────
  // หมายเหตุ:
  //   - orderdeadlines, ordershippeds, fabricimports, productions, inventories,
  //     ast_bill_of_structures, material_outsides, material_returns, packages
  //     เป็นตาราง PG-only (ไม่มีใน MySQL) → รักษาข้อมูล
  //   - วิธี: drop FK จาก PG-only tables → TRUNCATE → re-add FK
  //     เพราะ PostgreSQL ไม่อนุญาต TRUNCATE parent table ที่มี FK child อยู่นอก set
  console.log('🗑️  Truncating PostgreSQL tables...')
  if (ONLY_TABLES.length === 0) {
    // Drop FK constraints that point from PG-only tables to tables we're truncating
    await prisma.$executeRawUnsafe(`ALTER TABLE "ast_bill_of_structures" DROP CONSTRAINT IF EXISTS "ast_bill_of_structures_sourceOrderId_fkey"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "inventories"            DROP CONSTRAINT IF EXISTS "inventories_orderId_fkey"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "orderdeadlines"         DROP CONSTRAINT IF EXISTS "orderdeadlines_purchaseOrder_fkey"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "ordershippeds"          DROP CONSTRAINT IF EXISTS "ordershippeds_purchaseOrder_fkey"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "productions"            DROP CONSTRAINT IF EXISTS "productions_purchaseOrder_fkey"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "material_outsides"      DROP CONSTRAINT IF EXISTS "material_outsides_materialId_fkey"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "material_returns"       DROP CONSTRAINT IF EXISTS "material_returns_materialId_fkey"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "packages"               DROP CONSTRAINT IF EXISTS "packages_supplierId_fkey"`)

    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "fabric_asts",
        "fabric_aststructures",
        "fabricouts",
        "stockfabrics",
        "ast_purchaseorders",
        "coordinators",
        "customers",
        "suppliers",
        "materialrequisitions",
        "materialcoordinators",
        "materials"
    `)
  } else {
    // Targeted sync: truncate เฉพาะตารางที่ sync — FK order: requisitions → coordinators → materials
    const targeted: string[] = []
    if (ONLY_TABLES.some(t => ['materialRequisitions', 'materials'].includes(t)))
      targeted.push('"materialrequisitions"')
    if (ONLY_TABLES.includes('materialCoordinators'))
      targeted.push('"materialcoordinators"')
    if (ONLY_TABLES.includes('materials'))
      targeted.push('"materials"')
    if (targeted.length > 0)
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${targeted.join(', ')} CASCADE`)
  }
  console.log('  ✓ Truncated\n')

  // ── 3. INSERT ────────────────────────────────────────────────────────────

  if (should('customers')) {
    await insertBatch('customers', customers, batch =>
      prisma.customer.createMany({
        data: batch.map((c: any) => ({
          id:      Number(c.id),
          name:    c.name    ?? '',
          tax:     s(c.tax),
          address: s(c.address),
          tel:     s(c.tel),
          email:   s(c.email),
          type:    s(c.type),
          coor:    s(c.coor),
        })),
        skipDuplicates: true,
      })
    )
  }

  if (should('coordinators')) {
    await insertBatch('coordinators', coordinators, batch =>
      prisma.coordinator.createMany({
        data: batch.map((c: any) => ({
          id:       Number(c.id),
          tax:      c.tax  ?? '',
          name:     c.name ?? '',
          jobTitle: s(c.jobTitle),
          tel:      s(c.tel),
        })),
        skipDuplicates: true,
      })
    )
  }

  if (should('suppliers')) {
    await insertBatch('suppliers', suppliers, batch =>
      prisma.supplier.createMany({
        data: batch.map((c: any) => ({
          id:      Number(c.id),
          name:    c.name    ?? '',
          tax:     s(c.tax),
          address: s(c.address),
          tel:     s(c.tel),
          email:   s(c.email),
          type:    s(c.type),
          coor:    s(c.coor),
        })),
        skipDuplicates: true,
      })
    )
  }

  if (should('orders')) {
    const orderData = orders.map((o: any) => ({
      id:             Number(o.id),
      vat:            o.vat ?? 'SO',
      purchaseOrder:  String(o.purchaseOrder),
      po:             s(o.po),
      emp:            s(o.emp),
      customerName:   s(o.customerName),
      fabricId:       s(o.fabricId),
      fabricPattern:  s(o.fabricPattern),
      fabricStructure:s(o.fabricStructure),
      orderSumYard:   f(o.orderSumYard),
      orderSumM:      f(o.orderSumM),
      fabricSPY:      f(o.fabricSPY),
      fabricSpP:      f(o.fabricSpP),
      priceYard:      f(o.priceYard),
      priceM:         f(o.priceM),
      discountP:      f(o.discountP),
      discountYard:   f(o.discountYard),
      commission:     s(o.commission),
      createDate:     d(o.createDate),
      status:         s(o.status),
      deadline:       s(o.deadline),
      payment:        s(o.payment),
    }))
    await insertBatch('orders', orderData, batch =>
      prisma.astPurchaseOrder.createMany({ data: batch, skipDuplicates: true })
    )
  }

  if (should('structures')) {
    const structData: any[] = []
    for (const s_ of structs) {
      const po = idToPo.get(Number(s_.purchaseOrder))
      if (!po) continue
      structData.push({
        purchaseOrder: po,
        yarnHType:   s(s_.yarnHType1),
        yarnHType2:  s(s_.yarnHType2),
        subNameH1:   s(s_.subNameH1),
        subNameH2:   s(s_.subNameH2),
        yarnHCount1: s(s_.yarnHCount1),
        yarnHCount2: s(s_.yarnHCount2),
        yarnHRatio1: s(s_.yarnHRatio1),
        yarnHRatio2: s(s_.yarnHRatio2),
        yarnWType:   s(s_.yarnWType1),
        yarnWType2:  s(s_.yarnWType2),
        yarnWType3:  s(s_.yarnWType3),
        yarnWType4:  s(s_.yarnWType4),
        subNameW1:   s(s_.subNameW1),
        subNameW2:   s(s_.subNameW2),
        subNameW3:   s(s_.subNameW3),
        subNameW4:   s(s_.subNameW4),
        yarnWCount1: s(s_.yarnWCount1),
        yarnWCount2: s(s_.yarnWCount2),
        yarnWCount3: s(s_.yarnWCount3),
        yarnWCount4: s(s_.yarnWCount4),
        yarnWRatio1: s(s_.yarnWRatio1),
        yarnWRatio2: s(s_.yarnWRatio2 ?? s_.weftRatio2),
        yarnWRatio3: s(s_.yarnWRatio3),
        yarnWRatio4: s(s_.yarnWRatio4),
      })
    }
    await insertBatch('structures', structData, batch =>
      prisma.fabricAstStructure.createMany({ data: batch, skipDuplicates: true })
    )
  }

  if (should('fabricAsts')) {
    const faData: any[] = []
    let faSkipped = 0
    for (const fa of fabricAsts) {
      const po = idToPo.get(Number(fa.purchaseOrder))
      if (!po) { faSkipped++; continue }
      faData.push({
        purchaseOrder: po,
        vat:         s(fa.vat),
        yarnHCount:  s(fa.yarnHCount  ?? fa.yarn_h_count),
        fabricW:     s(fa.fabricW     ?? fa.fabric_w),
        phewNumber:  s(fa.phewNumber  ?? fa.phew_number),
        phewW:       s(fa.phewW       ?? fa.phew_w),
        stackType:   s(fa.stackType   ?? fa.stack_type),
        payment:     s(fa.payment),
      })
    }
    if (faSkipped > 0) console.log(`  ⚠ fabricAsts skipped ${faSkipped} rows (no matching order)`)
    await insertBatch('fabricAsts', faData, batch =>
      prisma.fabricAst.createMany({ data: batch, skipDuplicates: true })
    )
  }

  if (should('stockFabrics')) {
    const stockData = stocks.map((f_: any) => ({
      id:            Number(f_.id),
      refId:         f_.refId ?? '',
      emp:           s(f_.emp),
      fabricStruct:  s(f_.fabricStruct),
      fabricPattern: s(f_.fabricPattern),
      fabricW:       s(f_.fabricW),
      fabricCode:    s(f_.fabricId),
      fold:          i(f_.fold),
      sumYard:       f(f_.sumYard),
      customer:      s(f_.customer),
      createDate:    d(f_.createDate ?? f_.create_date),
    }))
    await insertBatch('stockFabrics', stockData, batch =>
      prisma.stockFabric.createMany({ data: batch, skipDuplicates: true })
    )
  }

  if (should('fabricOuts')) {
    // ดึง id จริงที่มีอยู่ใน PG หลัง insert orders แล้ว (แน่นอนกว่า map จาก MySQL)
    const pgOrderIds = new Set(
      (await prisma.astPurchaseOrder.findMany({ select: { id: true } })).map(o => o.id)
    )
    const foutData = fouts.map((f_: any) => {
      const rawOrderId = i(f_.order_id ?? f_.orderId)
      return {
        id:            Number(f_.id),
        refId:         f_.refId ?? '',
        no:            s(f_.no),
        vatType:       f_.vatType ?? 'A',
        vatNo:         i(f_.vatNo) ?? 1001,
        fold:          i(f_.fold) ?? 1,
        sumYard:       f(f_.sumYard) ?? 0,
        fabricStruct:       s(f_.fabricStruct),
        fabricPattern:      s(f_.fabricPattern),
        fabricW:            s(f_.fabricW),
        customerName:       s(f_.customerName),
        receiveName:        s(f_.receiveName),
        altPurchaseOrder:   s(f_.customerReplace ?? f_.customer_replace),
        purchaseOrder:      s(f_.purchase_order ?? f_.purchaseOrder),
        orderId:            (rawOrderId && pgOrderIds.has(rawOrderId)) ? rawOrderId : null,
        createDate:         d(f_.createDate ?? f_.create_date),
        stockCustomer:      s(f_.stockCustomer),
        stockFabricStruct:  s(f_.stockFabricStruct),
        stockFabricPattern: s(f_.stockFabricPattern),
        stockFabricW:       s(f_.stockFabricW),
      }
    })
    await insertBatch('fabricOuts', foutData, batch =>
      prisma.fabricOut.createMany({ data: batch, skipDuplicates: true })
    )
  }

  if (should('materialCoordinators')) {
    const coordData = empMaterials.map((r: any) => ({
      id:         Number(r.id),
      name:       r.name ?? '',
      tel:        s(r.tel),
      department: s(r.department),
      createdAt:  r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt:  r.updated_at ? new Date(r.updated_at) : new Date(),
      deletedAt:  r.deleted_at ? new Date(r.deleted_at) : null,
    }))
    await insertBatch('materialCoordinators', coordData, batch =>
      prisma.materialCoordinator.createMany({ data: batch, skipDuplicates: true })
    )
  }

  if (should('materials')) {
    const materialData = materials.map((r: any) => ({
      id:             Number(r.id),
      lot:            r.lot ?? '',
      spool:          i(r.spool) ?? 0,
      yarnType:       r.yarnType ?? r.yarn_type ?? '',
      supplierName:   r.supplierName ?? r.supplier_name ?? '',
      weightKgNet:    f(r.weight_kg_net)     ?? 0,
      weightKgSum:    f(r.weight_kg_sum)     ?? 0,
      weightKgPackage:f(r.weight_kg_package) ?? 0,
      pallet:         i(r.pallet)            ?? null,
      box:            i(r.box)               ?? null,
      sack:           i(r.sack)              ?? null,
      weightPNet:     f(r.weight_p_net)      ?? null,
      weightPSum:     f(r.weight_p_sum)      ?? null,
      weightPPackage: f(r.weight_p_package)  ?? null,
      averageKg:      f(r.average_kg)        ?? null,
      averageP:       f(r.average_p)         ?? null,
      emp:            s(r.emp),
      importStatus:   r.importStatus ?? r.import_status ?? 'completed',
      note:           s(r.note),
      createdAt:      r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt:      r.updated_at ? new Date(r.updated_at) : new Date(),
      deletedAt:      r.deleted_at ? new Date(r.deleted_at) : null,
    }))
    await insertBatch('materials', materialData, batch =>
      prisma.material.createMany({ data: batch, skipDuplicates: true })
    )
  }

  if (should('materialRequisitions')) {
    // materialstores ไม่มี materialId ตรงๆ — ใช้ lot+yarnType+supplierName match best-effort
    // materialId เป็น nullable ดังนั้น row ที่ match ไม่ได้ก็ import ได้ (materialId = null)
    const matLookup = new Map<string, number>()
    for (const m of materials) {
      const key = `${m.lot ?? ''}|${m.yarnType ?? ''}|${m.supplierName ?? ''}`
      matLookup.set(key, Number(m.id))
    }

    let matched = 0, unmatched = 0
    const reqData = materialStores.map((r: any) => {
      const key = `${r.lot ?? ''}|${r.yarnType ?? ''}|${r.supplierName ?? ''}`
      const mid = matLookup.get(key) ?? null
      if (mid) matched++; else unmatched++
      const base = {
        id:             Number(r.id),
        withdrawId:     r.withdrawId ?? '',
        department:     r.department ?? '',
        spool:          i(r.spool) ?? 0,
        weightWithdrawn:f(r.weight_kg_net) ?? 0,
        note:           null as string | null,
        createdAt:      r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt:      r.updated_at ? new Date(r.updated_at) : new Date(),
        deletedAt:      null as Date | null,
      }
      // Prisma v7 createMany ไม่รับ null สำหรับ nullable FK — ต้อง omit field แทน
      return mid !== null ? { ...base, materialId: mid } : base
    })
    console.log(`  materialRequisitions: ${matched} matched, ${unmatched} unmatched (materialId=null)`)
    await insertBatch('materialRequisitions', reqData, batch =>
      prisma.materialRequisition.createMany({ data: batch, skipDuplicates: true })
    )
  }

  // ── 4. Reset PostgreSQL sequences ──────────────────────────────────────────
  // จำเป็นเมื่อ import id โดยตรงจาก MySQL — sequence ยังไม่รู้ว่า max id ไปถึงไหน
  // ถ้าไม่ reset จะเกิด "Unique constraint failed on id" ทุกครั้งที่ insert record ใหม่
  console.log('🔢 Resetting PostgreSQL sequences...')
  const tables = [
    { table: 'customers',          col: 'id' },
    { table: 'coordinators',       col: 'id' },
    { table: 'suppliers',          col: 'id' },
    { table: 'ast_purchaseorders', col: 'id' },
    { table: 'fabric_asts',        col: 'id' },
    { table: 'fabric_aststructures', col: 'id' },
    { table: 'stockfabrics',       col: 'id' },
    { table: 'fabricouts',         col: 'id' },
    { table: 'orderdeadlines',     col: 'id' },
    { table: 'ordershippeds',      col: 'id' },
    { table: 'fabricimports',        col: 'id' },
    { table: 'materials',            col: 'id' },
    { table: 'materialrequisitions', col: 'id' },
    { table: 'materialcoordinators', col: 'id' },
  ]
  for (const { table, col } of tables) {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${table}"', '${col}'),
        COALESCE((SELECT MAX("${col}") FROM "${table}"), 1)
      )
    `)
  }
  console.log('  ✓ Sequences reset\n')

  // ── 5. Re-add FK constraints (full sync only) ──────────────────────────
  if (ONLY_TABLES.length === 0) {
    console.log('🔗 Re-adding FK constraints...')
    await prisma.$executeRawUnsafe(`ALTER TABLE "ast_bill_of_structures" ADD CONSTRAINT "ast_bill_of_structures_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES ast_purchaseorders(id) ON UPDATE CASCADE ON DELETE RESTRICT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "inventories"            ADD CONSTRAINT "inventories_orderId_fkey"                  FOREIGN KEY ("orderId")        REFERENCES ast_purchaseorders(id) ON UPDATE CASCADE ON DELETE SET NULL`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "orderdeadlines"         ADD CONSTRAINT "orderdeadlines_purchaseOrder_fkey"         FOREIGN KEY ("purchaseOrder")  REFERENCES ast_purchaseorders("purchaseOrder") ON UPDATE CASCADE ON DELETE RESTRICT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "ordershippeds"          ADD CONSTRAINT "ordershippeds_purchaseOrder_fkey"          FOREIGN KEY ("purchaseOrder")  REFERENCES ast_purchaseorders("purchaseOrder") ON UPDATE CASCADE ON DELETE RESTRICT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "productions"            ADD CONSTRAINT "productions_purchaseOrder_fkey"            FOREIGN KEY ("purchaseOrder")  REFERENCES ast_purchaseorders("purchaseOrder") ON UPDATE CASCADE ON DELETE RESTRICT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "material_outsides"      ADD CONSTRAINT "material_outsides_materialId_fkey"         FOREIGN KEY ("materialId")     REFERENCES materials(id) ON UPDATE CASCADE ON DELETE SET NULL`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "material_returns"       ADD CONSTRAINT "material_returns_materialId_fkey"          FOREIGN KEY ("materialId")     REFERENCES materials(id) ON UPDATE CASCADE ON DELETE SET NULL`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "packages"               ADD CONSTRAINT "packages_supplierId_fkey"                  FOREIGN KEY ("supplierId")     REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE SET NULL`)
    console.log('  ✓ FK constraints restored\n')
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────
  console.log('\n📊 สรุปข้อมูลใน PostgreSQL หลัง sync:')
  const [c, co, su, o, fs, fa, sf, fo, mat, matReq] = await Promise.all([
    prisma.customer.count(),
    prisma.coordinator.count(),
    prisma.supplier.count(),
    prisma.astPurchaseOrder.count(),
    prisma.fabricAstStructure.count(),
    prisma.fabricAst.count(),
    prisma.stockFabric.count(),
    prisma.fabricOut.count(),
    prisma.material.count(),
    prisma.materialRequisition.count(),
  ])
  console.log(`
  Customers:            ${c}
  Coordinators:         ${co}
  Suppliers:            ${su}
  Purchase Orders:      ${o}
  Fab Structures:       ${fs}
  Fab Asts:             ${fa}
  Stock Fabrics:        ${sf}
  Fabric Outs:          ${fo}
  Materials:            ${mat}
  Material Requisitions:${matReq}
  `)

  await db.end()
  await prisma.$disconnect()
  console.log('✅ Sync เสร็จสมบูรณ์!')
}

main().catch(e => {
  console.error('\n❌ Error:', e.message)
  process.exit(1)
})
