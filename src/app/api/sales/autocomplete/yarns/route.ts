import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''
  const type = searchParams.get('type') ?? 'warp'

  const safe = q.replace(/'/g, "''")

  let sql: string
  if (type === 'weft') {
    sql = `
      SELECT yarn, COUNT(*)::int as cnt FROM (
        SELECT "yarnWType"      as yarn FROM fabric_aststructures WHERE "yarnWType"      ILIKE '%${safe}%' AND "yarnWType"      IS NOT NULL AND "yarnWType"      != ''
        UNION ALL
        SELECT "yarn_w_type2"   as yarn FROM fabric_aststructures WHERE "yarn_w_type2"   ILIKE '%${safe}%' AND "yarn_w_type2"   IS NOT NULL AND "yarn_w_type2"   != ''
        UNION ALL
        SELECT "yarn_w_type3"   as yarn FROM fabric_aststructures WHERE "yarn_w_type3"   ILIKE '%${safe}%' AND "yarn_w_type3"   IS NOT NULL AND "yarn_w_type3"   != ''
        UNION ALL
        SELECT "yarn_w_type4"   as yarn FROM fabric_aststructures WHERE "yarn_w_type4"   ILIKE '%${safe}%' AND "yarn_w_type4"   IS NOT NULL AND "yarn_w_type4"   != ''
      ) t GROUP BY yarn ORDER BY cnt DESC LIMIT 20
    `
  } else {
    sql = `
      SELECT yarn, COUNT(*)::int as cnt FROM (
        SELECT "yarnHType"    as yarn FROM fabric_aststructures WHERE "yarnHType"    ILIKE '%${safe}%' AND "yarnHType"    IS NOT NULL AND "yarnHType"    != ''
        UNION ALL
        SELECT "yarn_h_type2" as yarn FROM fabric_aststructures WHERE "yarn_h_type2" ILIKE '%${safe}%' AND "yarn_h_type2" IS NOT NULL AND "yarn_h_type2" != ''
      ) t GROUP BY yarn ORDER BY cnt DESC LIMIT 20
    `
  }

  const rows = await prisma.$queryRawUnsafe(sql) as any[]
  return Response.json({ yarns: rows.map(r => r.yarn) })
}
