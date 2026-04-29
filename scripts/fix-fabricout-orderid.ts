import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  process.stdout.write('Fixing fabricOut.orderId via purchaseOrder pattern match...\n')

  // Build map: vatNo -> orderId using LIKE join
  const linked = await prisma.$queryRaw`
    SELECT DISTINCT f.id as fout_id, p.id as po_id
    FROM fabricouts f
    JOIN ast_purchaseorders p
      ON p."purchaseOrder" LIKE ('SO' || f."vatNo"::text || '/%')
      OR p."purchaseOrder" LIKE ('SOX' || f."vatNo"::text || '/%')
      OR p."purchaseOrder" LIKE ('SOB' || f."vatNo"::text || '/%')
    WHERE f."orderId" IS NULL
  ` as { fout_id: number; po_id: number }[]

  process.stdout.write('Matches to update: ' + linked.length + '\n')

  let fixed = 0
  for (const row of linked) {
    await prisma.fabricOut.update({
      where: { id: row.fout_id },
      data: { orderId: row.po_id }
    })
    fixed++
    if (fixed % 1000 === 0) process.stdout.write('  progress: ' + fixed + '/' + linked.length + '\n')
  }

  const nowLinked = await prisma.fabricOut.count({ where: { orderId: { not: null } } })
  process.stdout.write('Done! fabricOuts with orderId: ' + nowLinked + '\n')
}
main().catch(console.error).finally(() => prisma.$disconnect())
