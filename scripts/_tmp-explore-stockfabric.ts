import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('--- StockFabric sample rows ---')
  const samples = await prisma.stockFabric.findMany({ take: 10 })
  for (const s of samples) console.log(JSON.stringify(s))

  console.log('\n--- StockFabric count, and how many have fabricCode set ---')
  const total = await prisma.stockFabric.count()
  const withCode = await prisma.stockFabric.count({ where: { fabricCode: { not: null } } })
  const withCustomer = await prisma.stockFabric.count({ where: { customer: { not: null } } })
  console.log({ total, withCode, withCustomer })

  console.log('\n--- StockFabric rows for พรชัยวิรัช ---')
  const pcw = await prisma.stockFabric.findMany({ where: { customer: { contains: 'พรชัยวิรัช' } }, take: 10 })
  for (const s of pcw) console.log(JSON.stringify(s))
  const pcwCount = await prisma.stockFabric.count({ where: { customer: { contains: 'พรชัยวิรัช' } } })
  console.log('total StockFabric rows for พรชัยวิรัช:', pcwCount)

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
