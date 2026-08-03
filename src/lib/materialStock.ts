export const esc = (s: string) => s.replace(/'/g, "''")
export const KG_TO_LB = 2.20462

export function withLb<T extends { totalWeightKg: number | string; usedWeightKg: number | string; remainingWeightKg: number | string }>(
  row: T
): T & { totalWeightLb: number; usedWeightLb: number; remainingWeightLb: number } {
  return {
    ...row,
    totalWeightLb: Number(row.totalWeightKg) * KG_TO_LB,
    usedWeightLb: Number(row.usedWeightKg) * KG_TO_LB,
    remainingWeightLb: Number(row.remainingWeightKg) * KG_TO_LB,
  }
}

// Pre-aggregate each source table by materialId before joining, so a material with many
// requisition/outside/return rows doesn't fan out and double-count the others (each CTE
// yields at most one row per materialId, matching materials.id 1:1).
export const MATERIAL_STOCK_CTES = `
  req AS (
    SELECT "materialId", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
    FROM materialrequisitions
    WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
    GROUP BY "materialId"
  ),
  out_w AS (
    SELECT "materialId", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
    FROM material_outsides
    WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
    GROUP BY "materialId"
  ),
  ret AS (
    SELECT "materialId", SUM(spool) AS spool, SUM("weightReturn") AS weight
    FROM material_returns
    WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
    GROUP BY "materialId"
  ),
  -- เบิกภายในที่ materialId lookup พลาดตอน POST (materialId IS NULL) แต่ยังมี yarnType/supplierName
  -- ตรงจาก fix persist-yarnType-supplier — ไม่รวม 665 legacy record เก่าที่ field พวกนี้เป็น null ด้วย (ยังไม่ backfill)
  req_orphan_totals AS (
    SELECT "yarnType", "supplierName", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
    FROM materialrequisitions
    WHERE "deletedAt" IS NULL AND "materialId" IS NULL
      AND "yarnType" IS NOT NULL AND "supplierName" IS NOT NULL
    GROUP BY "yarnType", "supplierName"
  ),
  -- แจกยอด pool เท่าๆ กันให้ทุก lot ที่ yarnType+supplierName ตรงกัน (join ตรงไม่ได้เพราะไม่มี materialId)
  -- ผลลัพธ์เป็น 1 row ต่อ materials.id เหมือน req/out_w/ret ทุกประการ กัน fan-out ตอน SUM ใน GROUP BY รอบนอก
  req_orphan AS (
    SELECT m.id AS "materialId",
           t.spool::float / COUNT(*) OVER (PARTITION BY m."yarnType", m."supplierName") AS spool,
           t.weight        / COUNT(*) OVER (PARTITION BY m."yarnType", m."supplierName") AS weight
    FROM materials m
    JOIN req_orphan_totals t
      ON t."yarnType" = m."yarnType" AND t."supplierName" = m."supplierName"
    WHERE m."deletedAt" IS NULL
  )
`

export const MATERIAL_STOCK_JOINS = `
  LEFT JOIN req         ON req."materialId"        = m.id
  LEFT JOIN out_w       ON out_w."materialId"      = m.id
  LEFT JOIN ret          ON ret."materialId"        = m.id
  LEFT JOIN req_orphan   ON req_orphan."materialId" = m.id
`

// remaining = total - เบิกใช้งาน(req + req_orphan) - เบิกภายนอก(out_w) + คืนเข้าสต็อก(ret)
export const AGGREGATE_COLUMNS = `
  SUM(m.spool)::int                                                            AS "totalSpool",
  (COALESCE(SUM(req.spool), 0) + COALESCE(SUM(out_w.spool), 0)
    + COALESCE(SUM(req_orphan.spool), 0))::int                                AS "usedSpool",
  (SUM(m.spool)
    - COALESCE(SUM(req.spool), 0)
    - COALESCE(SUM(out_w.spool), 0)
    - COALESCE(SUM(req_orphan.spool), 0)
    + COALESCE(SUM(ret.spool), 0))::int                                        AS "remainingSpool",
  SUM(m."weightKgSum")                                                          AS "totalWeightKg",
  (COALESCE(SUM(req.weight), 0) + COALESCE(SUM(out_w.weight), 0)
    + COALESCE(SUM(req_orphan.weight), 0))                                    AS "usedWeightKg",
  (SUM(m."weightKgSum")
    - COALESCE(SUM(req.weight), 0)
    - COALESCE(SUM(out_w.weight), 0)
    - COALESCE(SUM(req_orphan.weight), 0)
    + COALESCE(SUM(ret.weight), 0))                                            AS "remainingWeightKg"
`
