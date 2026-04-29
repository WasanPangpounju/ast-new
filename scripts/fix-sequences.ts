import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const tables: [string, string][] = [
  ['customers', 'id'],
  ['suppliers', 'id'],
  ['ast_purchaseorders', 'id'],
  ['fabric_aststructures', 'id'],
  ['stockfabrics', 'id'],
  ['fabricouts', 'id'],
  ['employees', 'id'],
  ['users', 'id'],
]

async function main() {
  for (const [table, col] of tables) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'), COALESCE(MAX("${col}"), 1)) FROM "${table}"`
      )
      console.log(`  ✓ reset sequence: ${table}`)
    } catch (e: any) {
      console.log(`  skip: ${table} — ${e.message.slice(0, 80)}`)
    }
  }
  await prisma.$disconnect()
  console.log('Sequences fixed!')
}

main().catch(e => { console.error(e); process.exit(1) })
