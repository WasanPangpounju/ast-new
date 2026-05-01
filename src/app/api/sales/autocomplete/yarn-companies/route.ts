import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yarn = searchParams.get('yarn') ?? ''
  const side = searchParams.get('side') ?? 'warp'

  if (!yarn) return Response.json({ companies: [] })

  const contains = { mode: 'insensitive' as const }

  let rows: { subNameH1?: string | null; subNameH2?: string | null; subNameW1?: string | null; subNameW2?: string | null; subNameW3?: string | null; subNameW4?: string | null }[] = []

  if (side === 'warp') {
    rows = await prisma.fabricAstStructure.findMany({
      where: {
        OR: [
          { yarnHType: { equals: yarn, ...contains } },
          { yarnHType2: { equals: yarn, ...contains } },
        ],
      },
      select: { subNameH1: true, subNameH2: true },
      take: 100,
    })
    const seen = new Set<string>()
    const companies: string[] = []
    for (const r of rows) {
      for (const v of [r.subNameH1, r.subNameH2]) {
        if (v && v !== 'no data' && !seen.has(v)) { seen.add(v); companies.push(v) }
      }
    }
    return Response.json({ companies: companies.slice(0, 20) })
  } else {
    rows = await prisma.fabricAstStructure.findMany({
      where: {
        OR: [
          { yarnWType: { equals: yarn, ...contains } },
          { yarnWType2: { equals: yarn, ...contains } },
          { yarnWType3: { equals: yarn, ...contains } },
          { yarnWType4: { equals: yarn, ...contains } },
        ],
      },
      select: { subNameW1: true, subNameW2: true, subNameW3: true, subNameW4: true },
      take: 100,
    })
    const seen = new Set<string>()
    const companies: string[] = []
    for (const r of rows) {
      for (const v of [r.subNameW1, r.subNameW2, r.subNameW3, r.subNameW4]) {
        if (v && v !== 'no data' && !seen.has(v)) { seen.add(v); companies.push(v) }
      }
    }
    return Response.json({ companies: companies.slice(0, 20) })
  }
}
