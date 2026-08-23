import 'dotenv/config'
import mysql from 'mysql2/promise'

async function main() {
  const db = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)

  const [orders]: any = await db.query(
    `SELECT id, purchaseOrder, customerName, fabricId, fabricPattern, fabricStructure FROM ast_purchaseorders WHERE customerName LIKE '%พรชัยวิรัช%'`
  )
  console.log('Total orders for พรชัยวิรัช:', orders.length)

  const orderIds = orders.map((o: any) => o.id)
  const orderById = new Map(orders.map((o: any) => [o.id, o]))
  const orderByPO = new Map(orders.map((o: any) => [o.purchaseOrder, o]))

  const [fouts]: any = await db.query(
    `SELECT id, createDate, no, vatType, vatNo, customerName, receiveName, fabricStruct, fabricPattern, fabricW,
            fold, sumYard, orderId, purchaseOrder, customerReplace, fabricStructReplace,
            stockCustomer, stockFabricStruct, stockFabricPattern, stockFabricW
     FROM fabricouts WHERE orderId IN (${orderIds.join(',')}) OR purchaseOrder IN (${orders.map((o:any)=>`'${o.purchaseOrder}'`).join(',')})`
  )
  console.log('Total fabricouts linked:', fouts.length)

  // columns that hint at substitution
  const withReplace = fouts.filter((f: any) => f.customerReplace || f.fabricStructReplace)
  const withStock = fouts.filter((f: any) => f.stockCustomer || f.stockFabricStruct || f.stockFabricPattern || f.stockFabricW)
  console.log('Rows with customerReplace/fabricStructReplace set:', withReplace.length)
  console.log('Rows with stock* fields set:', withStock.length)

  if (withReplace.length) {
    console.log('\n--- sample withReplace ---')
    for (const r of withReplace.slice(0, 10)) console.log(JSON.stringify(r))
  }
  if (withStock.length) {
    console.log('\n--- sample withStock ---')
    for (const r of withStock.slice(0, 10)) console.log(JSON.stringify(r))
  }

  // Compare delivered spec vs order's own spec
  let mismatchCount = 0
  const mismatches: any[] = []
  for (const f of fouts) {
    const ord = f.orderId ? orderById.get(f.orderId) : (f.purchaseOrder ? orderByPO.get(f.purchaseOrder) : null)
    if (!ord) continue
    const structMismatch = ord.fabricStructure && f.fabricStruct &&
      ord.fabricStructure.replace(/\s+/g, '') !== f.fabricStruct.replace(/\s+/g, '')
    if (structMismatch) {
      mismatchCount++
      mismatches.push({ foutId: f.id, orderId: ord.id, PO: ord.purchaseOrder, orderStruct: ord.fabricStructure, deliveredStruct: f.fabricStruct, customerName: f.customerName, createDate: f.createDate, vatType: f.vatType, vatNo: f.vatNo, fold: f.fold, sumYard: f.sumYard })
    }
  }
  console.log('\nRows where delivered fabricStruct != order fabricStructure:', mismatchCount)
  for (const m of mismatches.slice(0, 30)) console.log(JSON.stringify(m))

  await db.end()
}
main().catch(e => { console.error(e); process.exit(1) })
