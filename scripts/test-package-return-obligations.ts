import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

async function main() {
  console.log('=== Test 1: MATERIAL_IMPORT (material/entry) — supplier matches an existing Supplier ===')

  const supplier = await prisma.supplier.findFirst({ where: { deletedAt: null } })
  if (!supplier) throw new Error('No supplier found in DB — cannot run test 1/2')

  const entryPayload = {
    items: [
      {
        lot: `TEST-LOT-${Date.now()}`,
        spool: 10,
        yarnType: 'TEST-YARN',
        supplierName: supplier.name,
        weightKgNet: 100,
        weightKgSum: 1000,
        weightKgPackage: 1050,
        pallet: 3,
        palletType: 'wood',
        box: 5,
        sack: 2,
        sackType: 'p',
        paperBar: 0, // ticked but qty 0 -> should be SKIPPED
        spoolType: 'spool_plastic',
        returnPallet: true,
        returnBox: true,
        returnSack: true,
        returnSpool: true,
        returnPaperBar: true, // ticked, qty 0 -> expect skip + warning, no throw
        emp: 'tester',
      },
    ],
  }

  const entryRes = await fetch(`${BASE_URL}/api/warehouse/material/entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entryPayload),
  })
  const entryJson = await entryRes.json()
  console.log('entry response:', entryRes.status, entryJson)
  if (!entryRes.ok) throw new Error('material/entry POST failed')

  const materialId = entryJson.ids[0]
  const importObligations = await prisma.packageReturnObligation.findMany({
    where: { materialId },
    orderBy: { category: 'asc' },
  })

  console.log(`Obligations created for Material#${materialId}: ${importObligations.length} (expect 4: PALLET, BOX, SACK, SPOOL — PAPER_BAR skipped since qty=0)`)
  for (const o of importObligations) {
    console.log(`  - ${o.category} qtyDue=${o.qtyDue} variant=${o.variant} supplierId=${o.supplierId} needsSupplierAssignment=${o.needsSupplierAssignment} sourceType=${o.sourceType}`)
  }

  const expectCategories = ['PALLET', 'BOX', 'SACK', 'SPOOL']
  const gotCategories = importObligations.map(o => o.category).sort()
  const categoriesOk = JSON.stringify(gotCategories) === JSON.stringify([...expectCategories].sort())
  const supplierOk = importObligations.every(o => o.supplierId === supplier.id && !o.needsSupplierAssignment)
  const palletVariantOk = importObligations.find(o => o.category === 'PALLET')?.variant === 'wood'
  const sackVariantOk = importObligations.find(o => o.category === 'SACK')?.variant === 'p'
  const spoolVariantOk = importObligations.find(o => o.category === 'SPOOL')?.variant === 'spool_plastic'
  const boxVariantOk = importObligations.find(o => o.category === 'BOX')?.variant === null
  const qtyOk = importObligations.find(o => o.category === 'PALLET')?.qtyDue === 3
    && importObligations.find(o => o.category === 'BOX')?.qtyDue === 5
    && importObligations.find(o => o.category === 'SACK')?.qtyDue === 2
    && importObligations.find(o => o.category === 'SPOOL')?.qtyDue === 10

  console.log('Test 1 checks:', { categoriesOk, supplierOk, palletVariantOk, sackVariantOk, spoolVariantOk, boxVariantOk, qtyOk })
  const test1Pass = categoriesOk && supplierOk && palletVariantOk && sackVariantOk && spoolVariantOk && boxVariantOk && qtyOk
  console.log(test1Pass ? '✅ Test 1 PASS' : '❌ Test 1 FAIL')

  console.log('\n=== Test 2: MATERIAL_IMPORT — supplierName does NOT match any Supplier ===')
  const unmatchedSupplierName = `UNKNOWN-SUPPLIER-${Date.now()}`
  const entryPayload2 = {
    items: [
      {
        lot: `TEST-LOT2-${Date.now()}`,
        spool: 7,
        yarnType: 'TEST-YARN-2',
        supplierName: unmatchedSupplierName,
        weightKgNet: 50,
        weightKgSum: 350,
        weightKgPackage: 370,
        box: 4,
        returnBox: true,
        emp: 'tester',
      },
    ],
  }
  const entryRes2 = await fetch(`${BASE_URL}/api/warehouse/material/entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entryPayload2),
  })
  const entryJson2 = await entryRes2.json()
  console.log('entry response:', entryRes2.status, entryJson2)
  if (!entryRes2.ok) throw new Error('material/entry POST (test 2) failed')

  const materialId2 = entryJson2.ids[0]
  const importObligations2 = await prisma.packageReturnObligation.findMany({ where: { materialId: materialId2 } })
  console.log(`Obligations created for Material#${materialId2}: ${importObligations2.length} (expect 1: BOX)`)
  for (const o of importObligations2) {
    console.log(`  - ${o.category} qtyDue=${o.qtyDue} supplierId=${o.supplierId} needsSupplierAssignment=${o.needsSupplierAssignment}`)
  }
  const test2Pass = importObligations2.length === 1
    && importObligations2[0].category === 'BOX'
    && importObligations2[0].qtyDue === 4
    && importObligations2[0].supplierId === null
    && importObligations2[0].needsSupplierAssignment === true
  console.log(test2Pass ? '✅ Test 2 PASS' : '❌ Test 2 FAIL')

  console.log('\n=== Test 3: MATERIAL_OUTSIDE (material/outside) ===')
  const outsidePayload = {
    withdrawId: `TEST-WD-${Date.now()}`,
    yarnType: 'TEST-YARN-OUT',
    supplierName: supplier.name,
    spool: 6,
    weightWithdrawn: 60,
    pallet: 2,
    sack: 1,
    returnPallet: true,
    returnSack: true,
    returnBox: true, // ticked, box not provided -> qtyDue null -> expect skip
    recipient: 'โรงงานทดสอบ',
  }
  const outsideRes = await fetch(`${BASE_URL}/api/warehouse/material/outside`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outsidePayload),
  })
  const outsideJson = await outsideRes.json()
  console.log('outside response:', outsideRes.status, outsideJson)
  if (!outsideRes.ok) throw new Error('material/outside POST failed')

  const outsideId = outsideJson.data.id
  const outsideObligations = await prisma.packageReturnObligation.findMany({
    where: { materialOutsideId: outsideId },
    orderBy: { category: 'asc' },
  })
  console.log(`Obligations created for MaterialOutside#${outsideId}: ${outsideObligations.length} (expect 2: PALLET, SACK — BOX skipped since qty=null)`)
  for (const o of outsideObligations) {
    console.log(`  - ${o.category} qtyDue=${o.qtyDue} variant=${o.variant} supplierId=${o.supplierId} recipientName=${o.recipientName} sourceType=${o.sourceType}`)
  }
  const test3Pass = outsideObligations.length === 2
    && outsideObligations.every(o => o.supplierId === null && o.recipientName === 'โรงงานทดสอบ' && o.variant === null && o.sourceType === 'MATERIAL_OUTSIDE')
    && outsideObligations.find(o => o.category === 'PALLET')?.qtyDue === 2
    && outsideObligations.find(o => o.category === 'SACK')?.qtyDue === 1
  console.log(test3Pass ? '✅ Test 3 PASS' : '❌ Test 3 FAIL')

  console.log('\n=== Cleanup: removing test records ===')
  await prisma.packageReturnObligation.deleteMany({ where: { materialId: { in: [materialId, materialId2] } } })
  await prisma.packageReturnObligation.deleteMany({ where: { materialOutsideId: outsideId } })
  await prisma.material.deleteMany({ where: { id: { in: [materialId, materialId2] } } })
  await prisma.materialOutside.deleteMany({ where: { id: outsideId } })
  console.log('Cleanup done.')

  console.log('\n=== SUMMARY ===')
  console.log({ test1Pass, test2Pass, test3Pass })
  if (!test1Pass || !test2Pass || !test3Pass) process.exitCode = 1

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
