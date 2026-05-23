import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  console.log('Connecting to MySQL via SSH tunnel...')
  const db = await mysql.createConnection(mysqlUrl)
  console.log('Connected!\n')

  // 1. Customers
  console.log('[1/7] Migrating customers...')
  const [customers]: any = await db.query('SELECT * FROM customers')
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        name: c.name ?? '',
        tax: c.tax ?? null,
        address: c.address ?? null,
        tel: c.tel ?? null,
        email: c.email ?? null,
        type: c.type ?? null,
        coor: c.coor ?? null,
      }
    })
  }
  console.log(`  ✓ ${customers.length} customers`)

  // 1b. Coordinators
  console.log('[1b] Migrating coordinators...')
  const [coordRows]: any = await db.query('SELECT * FROM coordinators')
  let coOk = 0
  for (const c of coordRows as any[]) {
    await prisma.coordinator.upsert({
      where: { id: c.id },
      update: { tax: c.tax ?? '', name: c.name ?? '', jobTitle: c.jobTitle ?? null, tel: c.tel ?? null },
      create: { id: c.id, tax: c.tax ?? '', name: c.name ?? '', jobTitle: c.jobTitle ?? null, tel: c.tel ?? null }
    })
    coOk++
  }
  console.log(`  ✓ ${coOk} coordinators`)

  // 2. Suppliers
  console.log('[2/7] Migrating suppliers...')
  const [suppliers]: any = await db.query('SELECT * FROM suppliers')
  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        name: s.name ?? '',
        tax: s.tax ?? null,
        address: s.address ?? null,
        tel: s.tel ?? null,
        email: s.email ?? null,
        type: s.type ?? null,
        coor: s.coor ?? null,
      }
    })
  }
  console.log(`  ✓ ${suppliers.length} suppliers`)

  // 3. Purchase Orders
  console.log('[3/7] Migrating purchase orders...')
  const [orders]: any = await db.query('SELECT * FROM ast_purchaseorders ORDER BY id ASC')
  let ok = 0, skip = 0
  for (const o of orders) {
    try {
      await prisma.astPurchaseOrder.upsert({
        where: { purchaseOrder: String(o.purchaseOrder) },
        update: {
          priceYard: o.priceYard ? parseFloat(o.priceYard) : null,
          priceM: o.priceM ? parseFloat(o.priceM) : null,
          discountP: o.discountP ? parseFloat(o.discountP) : null,
          discountYard: o.discountYard ? parseFloat(o.discountYard) : null,
          commission: o.commission ? parseFloat(o.commission) : null,
          fabricSPY: o.fabricSPY ? parseFloat(o.fabricSPY) : null,
          fabricSpP: o.fabricSpP ? parseFloat(o.fabricSpP) : null,
          orderSumM: o.orderSumM ? parseFloat(o.orderSumM) : null,
          createDate: o.createDate ? new Date(o.createDate) : new Date(),
        },
        create: {
          id: o.id,
          vat: o.vat ?? 'SO',
          purchaseOrder: String(o.purchaseOrder),
          po: o.po ?? null,
          emp: o.emp ?? null,
          customerName: o.customerName ?? null,
          fabricId: o.fabricId ?? null,
          fabricPattern: o.fabricPattern ?? null,
          fabricStructure: o.fabricStructure ?? null,
          orderSumYard: o.orderSumYard ? parseFloat(o.orderSumYard) : null,
          orderSumM: o.orderSumM ? parseFloat(o.orderSumM) : null,
          fabricSPY: o.fabricSPY ? parseFloat(o.fabricSPY) : null,
          fabricSpP: o.fabricSpP ? parseFloat(o.fabricSpP) : null,
          priceYard: o.priceYard ? parseFloat(o.priceYard) : null,
          priceM: o.priceM ? parseFloat(o.priceM) : null,
          discountP: o.discountP ? parseFloat(o.discountP) : null,
          discountYard: o.discountYard ? parseFloat(o.discountYard) : null,
          commission: o.commission ? parseFloat(o.commission) : null,
          createDate: o.createDate ? new Date(o.createDate) : new Date(),
          status: o.status ?? null,
          deadline: o.deadline ?? null,
          payment: o.payment ?? null,
        }
      })
      ok++
    } catch (e: any) {
      skip++
      if (skip <= 5) console.log(`  skip ${o.purchaseOrder}: ${e.message.slice(0,80)}`)
    }
  }
  console.log(`  ✓ ${ok} orders, ${skip} skipped`)

  // 4. Fabric AST Structures
  // fabric_aststructures.purchaseOrder stores the integer ID of the order,
  // but Prisma's FK references ast_purchaseorders.purchaseOrder (the formatted string).
  // Build a map: order id -> purchaseOrder string.
  console.log('[4/7] Migrating fabric structures...')
  const [orderRows]: any = await db.query('SELECT id, purchaseOrder FROM ast_purchaseorders')
  const idToPo = new Map<number, string>(orderRows.map((o: any) => [o.id, o.purchaseOrder]))

  const [structs]: any = await db.query('SELECT * FROM fabric_aststructures')
  let sOk = 0, sSkip = 0
  for (const s of structs) {
    const po = idToPo.get(Number(s.purchaseOrder)) ?? null
    if (!po) { sSkip++; continue }
    try {
      await prisma.fabricAstStructure.upsert({
        where: { purchaseOrder: po },
        update: { yarnWRatio2: s.yarnWRatio2 ?? null },
        create: {
          purchaseOrder: po,
          yarnHType: s.yarnHType ?? null,
          yarnWType: s.yarnWType ?? null,
          yarnWRatio2: s.yarnWRatio2 ?? null,
          yarnHRatio1: s.yarnHRatio1 ?? null,
          yarnHRatio2: s.yarnHRatio2 ?? null,
          yarnWRatio1: s.yarnWRatio1 ?? null,
          yarnHCount1: s.yarnHCount1 ?? null,
          yarnHCount2: s.yarnHCount2 ?? null,
          yarnWCount1: s.yarnWCount1 ?? null,
          yarnWCount2: s.yarnWCount2 ?? null,
        }
      })
      sOk++
    } catch (e: any) {
      sSkip++
      if (sSkip <= 3) console.log(`  skip: ${e.message.slice(0, 100)}`)
    }
  }
  console.log(`  ✓ ${sOk} structures, ${sSkip} skipped`)

  // 5. Stock Fabrics
  console.log('[5/7] Migrating stock fabrics...')
  const [stocks]: any = await db.query('SELECT * FROM stockfabrics ORDER BY id ASC')
  let stOk = 0
  const BATCH = 200
  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH)
    await prisma.$transaction(
      batch.map((f: any) => {
        const cd = f.createDate ?? f.create_date ?? null
        const createDate = cd ? new Date(cd) : new Date()
        return prisma.stockFabric.upsert({
          where: { id: f.id },
          update: { createDate },
          create: {
            id: f.id,
            refId: f.refId ?? '',
            emp: f.emp ?? null,
            fabricStruct: f.fabricStruct ?? null,
            fabricPattern: f.fabricPattern ?? null,
            fabricW: f.fabricW ?? null,
            fabricCode: f.fabricId ?? null,
            fold: f.fold ? parseInt(f.fold) : null,
            sumYard: f.sumYard ? parseFloat(f.sumYard) : null,
            customer: f.customer ?? null,
            createDate,
          }
        })
      })
    )
    stOk += batch.length
    process.stdout.write(`\r  ${stOk}/${stocks.length}...`)
  }
  console.log(`\n  ✓ ${stOk} stock fabrics`)

  // 6. Fabric Outs
  console.log('[6/7] Migrating fabricouts...')
  const [fouts]: any = await db.query('SELECT * FROM fabricouts ORDER BY id ASC')
  let fOk = 0
  for (let i = 0; i < fouts.length; i += BATCH) {
    const batch = fouts.slice(i, i + BATCH)
    await prisma.$transaction(
      batch.map((f: any) => {
        const cd = f.createDate ?? f.create_date ?? null
        const createDate = cd ? new Date(cd) : new Date()
        return prisma.fabricOut.upsert({
          where: { id: f.id },
          update: { createDate },
          create: {
            id: f.id,
            refId: f.refId ?? '',
            no: f.no ? String(f.no) : null,
            vatType: f.vatType ?? 'A',
            vatNo: f.vatNo ? parseInt(f.vatNo) : 1001,
            fold: f.fold ? parseInt(f.fold) : 1,
            sumYard: f.sumYard ? parseFloat(f.sumYard) : 0,
            fabricStruct: f.fabricStruct ?? null,
            fabricPattern: f.fabricPattern ?? null,
            fabricW: f.fabricW ?? null,
            customerName: f.customerName ?? null,
            receiveName: f.receiveName ?? null,
            purchaseOrder: f.purchase_order ?? f.purchaseOrder ?? null,
            orderId: f.order_id ? Number(f.order_id) : null,
            createDate,
          }
        })
      })
    )
    fOk += batch.length
    process.stdout.write(`\r  ${fOk}/${fouts.length}...`)
  }
  console.log(`\n  ✓ ${fOk} fabricouts`)

  // migrate fabric_asts (contains fabricW / หน้ากว้าง)
  console.log('[+] Migrating fabric_asts...')
  const [fabricAsts]: any = await db.query('SELECT * FROM fabric_asts')
  let faOk = 0, faSkip = 0
  // Build order id -> purchaseOrder string map (reuse from section 4 pattern)
  const [poRows]: any = await db.query('SELECT id, purchaseOrder FROM ast_purchaseorders')
  const idToPoMap = new Map<number, string>(poRows.map((o: any) => [o.id, o.purchaseOrder]))
  for (const fa of fabricAsts) {
    const po = idToPoMap.get(Number(fa.purchaseOrder)) ?? String(fa.purchaseOrder)
    try {
      await prisma.fabricAst.upsert({
        where: { purchaseOrder: po },
        update: {
          fabricW: fa.fabricW ?? fa.fabric_w ?? null,
          phewW: fa.phewW ?? fa.phew_w ?? null,
          phewNumber: fa.phewNumber ?? fa.phew_number ?? null,
          yarnHCount: fa.yarnHCount ?? fa.yarn_h_count ?? null,
          vat: fa.vat ?? null,
          payment: fa.payment ?? null,
        },
        create: {
          purchaseOrder: po,
          vat: fa.vat ?? null,
          yarnHCount: fa.yarnHCount ?? fa.yarn_h_count ?? null,
          fabricW: fa.fabricW ?? fa.fabric_w ?? null,
          phewNumber: fa.phewNumber ?? fa.phew_number ?? null,
          phewW: fa.phewW ?? fa.phew_w ?? null,
          payment: fa.payment ?? null,
        }
      })
      faOk++
    } catch (e: any) {
      faSkip++
      if (faSkip <= 3) console.log('  skip fabricAst:', e.message.slice(0, 80))
    }
  }
  console.log(`  ✓ ${faOk} fabric_asts, ${faSkip} skipped`)

  // 7. Final counts
  console.log('\n[7/7] Final counts in PostgreSQL:')
  const [c, s, co, o, fs, sf, fo] = await Promise.all([
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.coordinator.count(),
    prisma.astPurchaseOrder.count(),
    prisma.fabricAstStructure.count(),
    prisma.stockFabric.count(),
    prisma.fabricOut.count(),
  ])
  console.log(`
  Customers:       ${c}
  Suppliers:       ${s}
  Coordinators:    ${co}
  Purchase Orders: ${o}
  Fab Structures:  ${fs}
  Stock Fabrics:   ${sf}
  Fabric Outs:     ${fo}
  `)

  await db.end()
  await prisma.$disconnect()
  console.log('Migration complete! ✅')
}

main().catch(e => { console.error(e); process.exit(1) })
