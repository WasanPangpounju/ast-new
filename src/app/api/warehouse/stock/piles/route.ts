import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { CK, NC, NP, sameFabric } from '@/lib/fabricOutMatch'

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`

interface PileRow {
  id: number
  name: string
  customer: string
  fabricStruct: string
  fabricPattern: string
  fabricW: string
}

// GET — กองผ้าที่สร้างเอง
//   default:        piles of one fabric (customer + struct + pattern + width, normalized
//                   like the stock summary) — for คีย์ผ้าเข้าสต็อก's กองผ้า dropdown.
//   mode=targets:   every group a lot can move to (ย้ายกอง): same struct + pattern +
//                   width, any customer — each customer's กองหลัก plus every pile.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const fabric = {
    fabricStruct: (sp.get('fabricStruct') ?? '').trim(),
    fabricPattern: (sp.get('fabricPattern') ?? '').trim(),
    fabricW: (sp.get('fabricW') ?? '').trim(),
  }
  if (!fabric.fabricStruct) return Response.json({ piles: [], mainGroups: [] })

  if (sp.get('mode') === 'targets') {
    const [piles, mainGroups] = await Promise.all([
      prisma.$queryRawUnsafe<PileRow[]>(`
        SELECT p.id, p.name, ${NC('p.customer')} AS customer, p."fabricStruct", p."fabricPattern", p."fabricW"
        FROM stock_piles p
        WHERE p.deleted_at IS NULL AND ${sameFabric(fabric, 'p')}
        ORDER BY customer, p.name
      `),
      // one กองหลัก per customer (whitespace-insensitive, like STOCK_GROUP_KEY)
      prisma.$queryRawUnsafe<{ customer: string }[]>(`
        SELECT (ARRAY_AGG(${NC('s.customer')} ORDER BY s."createDate" DESC NULLS LAST, s.id DESC))[1] AS customer
        FROM stockfabrics s
        WHERE s.deleted_at IS NULL AND s.stock_pile_id IS NULL AND ${sameFabric(fabric, 's')}
        GROUP BY ${CK(NC('s.customer'))}
        ORDER BY 1
      `),
    ])
    return Response.json({ piles, mainGroups: mainGroups.map(g => g.customer) })
  }

  const customer = (sp.get('customer') ?? '').trim()
  const piles = await prisma.$queryRawUnsafe<PileRow[]>(`
    SELECT p.id, p.name, ${NC('p.customer')} AS customer, p."fabricStruct", p."fabricPattern", p."fabricW"
    FROM stock_piles p
    WHERE p.deleted_at IS NULL AND ${sameFabric(fabric, 'p')}
      AND ${CK(NC('p.customer'))} = ${CK(NC(lit(customer)))}
    ORDER BY p.name
  `)
  return Response.json({ piles })
}

// POST — สร้างกองใหม่ { name, customer, fabricStruct, fabricPattern, fabricW }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
  const fabricStruct = String(body.fabricStruct ?? '').trim()
  if (!name) return Response.json({ error: 'กรุณาตั้งชื่อกอง' }, { status: 400 })
  if (!fabricStruct) return Response.json({ error: 'กรุณากรอกโครงสร้างผ้า' }, { status: 400 })

  // Pile names are picked from a list in เปิดบิลผ้า — keep them unique (case/space-insensitive)
  const dup = await prisma.$queryRawUnsafe<{ id: number }[]>(`
    SELECT id FROM stock_piles
    WHERE deleted_at IS NULL AND LOWER(${NP('name')}) = LOWER(${NP(lit(name))})
    LIMIT 1
  `)
  if (dup.length > 0) return Response.json({ error: `มีกองชื่อ "${name}" อยู่แล้ว` }, { status: 409 })

  const pile = await prisma.stockPile.create({
    data: {
      name,
      customer: String(body.customer ?? '').trim() || 'AST',
      fabricStruct,
      fabricPattern: String(body.fabricPattern ?? '').trim(),
      fabricW: String(body.fabricW ?? '').trim(),
      createdBy: session.user?.email ?? session.user?.name ?? 'unknown',
    },
    select: { id: true, name: true, customer: true, fabricStruct: true, fabricPattern: true, fabricW: true },
  })
  return Response.json({ ok: true, pile })
}

// DELETE ?id= — ลบกอง: only when nothing is left in it (no lots, no bills)
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(request.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'id required' }, { status: 400 })

  const [lots, bills] = await Promise.all([
    prisma.stockFabric.count({ where: { stockPileId: id, deletedAt: null } }),
    prisma.fabricOut.count({ where: { stockPileId: id, deletedAt: null } }),
  ])
  if (lots > 0 || bills > 0) {
    return Response.json({ error: `ลบไม่ได้ — กองนี้ยังมีผ้า ${lots} พับ และบิล ${bills} พับ` }, { status: 409 })
  }
  const result = await prisma.stockPile.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
  if (result.count === 0) return Response.json({ error: 'ไม่พบกอง' }, { status: 404 })
  return Response.json({ ok: true })
}

