import 'dotenv/config'
import mysql from 'mysql2/promise'

async function main() {
  const db = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)

  const [orders]: any = await db.query(
    `SELECT id, purchaseOrder, customerName, fabricId, fabricPattern, fabricStructure FROM ast_purchaseorders WHERE customerName LIKE '%พรชัยวิรัช%'`
  )
  const orderIds = orders.map((o: any) => o.id)
  const orderById = new Map(orders.map((o: any) => [o.id, o]))
  const orderByPO = new Map(orders.map((o: any) => [o.purchaseOrder, o]))

  const [fouts]: any = await db.query(
    `SELECT id, createDate, no, vatType, vatNo, customerName, receiveName, fabricStruct, fabricPattern, fabricW,
            fold, sumYard, orderId, purchaseOrder, customerReplace, fabricStructReplace,
            stockCustomer, stockFabricStruct, stockFabricPattern, stockFabricW
     FROM fabricouts WHERE orderId IN (${orderIds.join(',')}) OR purchaseOrder IN (${orders.map((o:any)=>`'${o.purchaseOrder}'`).join(',')})`
  )

  // 1. any fabricStructReplace set at all?
  const withStructReplace = fouts.filter((f: any) => f.fabricStructReplace)
  console.log('Rows with fabricStructReplace SET (non-null):', withStructReplace.length)
  for (const r of withStructReplace.slice(0, 20)) console.log(JSON.stringify(r))

  // 2. stockCustomer != delivery customerName (fabric sourced from a DIFFERENT customer's stock)
  const stockFromOtherCustomer = fouts.filter((f: any) => f.stockCustomer && f.customerName && f.stockCustomer.trim() !== f.customerName.trim())
  console.log('\nRows where stockCustomer != delivery customerName:', stockFromOtherCustomer.length)
  for (const r of stockFromOtherCustomer.slice(0, 20)) console.log(JSON.stringify(r))

  // 3. stockFabricStruct/Pattern/W differs from delivered fabricStruct/Pattern/W (structure swapped at delivery vs stock source)
  const stockStructDiffers = fouts.filter((f: any) => {
    if (!f.stockFabricStruct) return false
    return f.stockFabricStruct.replace(/\s+/g,'') !== (f.fabricStruct || '').replace(/\s+/g,'')
  })
  console.log('\nRows where stockFabricStruct != delivered fabricStruct:', stockStructDiffers.length)
  for (const r of stockStructDiffers.slice(0, 20)) console.log(JSON.stringify(r))

  // 4. fabricPattern mismatch vs order.fabricPattern
  let patMismatch = 0
  const patSamples: any[] = []
  for (const f of fouts) {
    const ord = f.orderId ? orderById.get(f.orderId) : (f.purchaseOrder ? orderByPO.get(f.purchaseOrder) : null)
    if (!ord) continue
    if (ord.fabricPattern && f.fabricPattern && ord.fabricPattern.trim() !== f.fabricPattern.trim()) {
      patMismatch++
      patSamples.push({ foutId: f.id, orderId: ord.id, PO: ord.purchaseOrder, orderPattern: ord.fabricPattern, deliveredPattern: f.fabricPattern, createDate: f.createDate, vatType: f.vatType, vatNo: f.vatNo })
    }
  }
  console.log('\nRows where delivered fabricPattern != order fabricPattern:', patMismatch)
  for (const s of patSamples.slice(0, 20)) console.log(JSON.stringify(s))

  // 5. distinct customerReplace values (to understand the field's actual meaning)
  const distinctReplace = [...new Set(fouts.map((f:any) => f.customerReplace).filter(Boolean))]
  console.log('\nDistinct customerReplace values (count=' + distinctReplace.length + '):')
  for (const v of distinctReplace.slice(0, 30)) console.log(' ', v)

  await db.end()
}
main().catch(e => { console.error(e); process.exit(1) })
