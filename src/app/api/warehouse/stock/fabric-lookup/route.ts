import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// Same NS normalization used in the existing stock queries
const NS_SQL = (col: string) =>
  `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(${col}, '')), '\\s+', ' ', 'g'), '\\s*\\*\\s*', '/', 'g'), '\\s+[xX]\\s+', '/', 'g'), '\\s*/\\s*', '/', 'g'))`

// JS normalizer — also handles x without spaces (C20xCSY16 → C20/CSY16)
function normalizeQ(s: string): string {
  return s.trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\*\s*/g, '/')
    .replace(/\s*[xX]\s*/g, '/')
    .replace(/\s*\/\s*/g, '/')
}

// Extract search terms.
// Step 1: split by space only → preserves slash-tokens like "2/2", "TR16/7864"
// Step 2: also add sub-tokens split by slash → "TR16", "7864"
// Both steps deduplicated; single-char tokens dropped.
function extractTerms(raw: string): string[] {
  const spaceTerms = raw.split(/\s+/).filter(t => t.length >= 2)
  const subTerms   = raw.split(/[\s/]+/).filter(t => t.length >= 2)
  return [...new Set([raw, ...spaceTerms, ...subTerms])]
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return Response.json({ results: [] })

  const esc = (s: string) => s.replace(/'/g, "''")

  const qNorm  = normalizeQ(q)
  const terms     = extractTerms(q).map(esc)
  const normTerms = extractTerms(qNorm).map(esc)

  // Width: prefer token with " or ' suffix, else 2-3 digit standalone number
  // (4-digit tokens like 7864 are style codes, not widths)
  const allSpaceTokens = q.split(/\s+/)
  const numericTokens  = allSpaceTokens.filter(t => /^\d+["']?$/.test(t))
  const widthToken = numericTokens.find(t => /^\d+["']$/.test(t))
    ?? numericTokens.find(t => /^\d{2,3}$/.test(t))
  const widthValue = widthToken ? widthToken.replace(/["']/g, '') : null

  // Conditions on raw columns (fabricCode, fabricStruct, fabricPattern)
  const rawConditions = terms.map(t =>
    `(s."fabricCode" ILIKE '%${t}%' OR s."fabricStruct" ILIKE '%${t}%' OR s."fabricPattern" ILIKE '%${t}%')`
  )

  // Conditions on NS-normalised fabricStruct (handles "C20 x CSY16" ↔ "C20xCSY16")
  const nsConditions = normTerms.map(t =>
    `${NS_SQL('s."fabricStruct"')} ILIKE '%${t}%'`
  )

  // Separate width condition
  const widthConditions = widthValue
    ? [`s."fabricW" ILIKE '%${esc(widthValue)}%'`]
    : []

  const allConditions = [...rawConditions, ...nsConditions, ...widthConditions]

  type Row = {
    fabricCode: string | null
    fabricStruct: string
    fabricPattern: string
    fabricW: string
    customer: string
  }

  try {
    const results = await prisma.$queryRawUnsafe<Row[]>(`
      SELECT DISTINCT
        s."fabricCode",
        s."fabricStruct",
        s."fabricPattern",
        s."fabricW",
        COALESCE(s."customer", 'AST') AS customer
      FROM stockfabrics s
      WHERE s.deleted_at IS NULL
        AND (${allConditions.join(' OR ')})
      ORDER BY
        CASE WHEN s."fabricCode" ILIKE '%${esc(q)}%' THEN 0 ELSE 1 END,
        s."fabricStruct", s."fabricPattern"
      LIMIT 15
    `)
    return Response.json({ results })
  } catch (err: unknown) {
    console.error('[fabric-lookup]', err)
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
