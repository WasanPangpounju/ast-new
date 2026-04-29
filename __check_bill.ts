import 'dotenv/config'
import { prisma } from './src/lib/prisma'
async function main() {
  const sample = await prisma.fabricOut.findFirst({
    orderBy: { id: 'desc' },
  })
  process.stdout.write('FabricOut fields: ' + JSON.stringify(Object.keys(sample ?? {}), null, 2) + '\n')
  process.stdout.write('Sample: ' + JSON.stringify(sample, null, 2) + '\n\n')

  const cols = await prisma.$queryRaw`
    SELECT column_name,
           data_type,
           is_nullable,
           column_default
    FROM information_schema.columns
    WHERE table_name = 'fabricouts'
    ORDER BY ordinal_position
  ` as any[]
  process.stdout.write('fabricouts columns:\n')
  for (const c of cols) {
    process.stdout.write(`  ${c.column_name.padEnd(22)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable} default=${c.column_default ?? 'none'}\n`)
  }

  const depositCols = await prisma.$queryRaw`
    SELECT column_name,
           data_type,
           is_nullable,
           column_default
    FROM information_schema.columns
    WHERE table_name = 'fabricoutdeposits'
    ORDER BY ordinal_position
  ` as any[]
  process.stdout.write('\nfabric_out_deposits columns:\n')
  for (const c of depositCols) {
    process.stdout.write(`  ${c.column_name.padEnd(22)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable} default=${c.column_default ?? 'none'}\n`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
