import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// Business key used for audit_logs.recordKey — fabricouts has no single row id
// representing "one bill" (1 bill = many rolls sharing vatType+vatNo).
const recordKey = (vatType: string, vatNo: number) => `${vatType}-${vatNo}`

const TABLE_NAME = 'fabricouts'
const FIELD_NAME = 'createDate'

// GET — change history for a bill's date (แสดงประวัติการแก้ไขวันที่)
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const vatType = request.nextUrl.searchParams.get('vatType')
  const vatNo = request.nextUrl.searchParams.get('vatNo')
  if (!vatType || vatNo == null) {
    return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })
  }

  const history = await prisma.auditLog.findMany({
    where: {
      tableName: TABLE_NAME,
      fieldName: FIELD_NAME,
      recordKey: recordKey(vatType, Number(vatNo)),
    },
    orderBy: { changedAt: 'desc' },
    select: { id: true, oldValue: true, newValue: true, changedBy: true, changedAt: true },
  })

  return Response.json({ history })
}

// PATCH — edit วันที่บิล (createDate) for every roll sharing this vatType+vatNo
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vatType, vatNo, newDate } = body
  if (!vatType || vatNo == null || !newDate) {
    return Response.json({ error: 'vatType, vatNo and newDate required' }, { status: 400 })
  }

  const parsedDate = new Date(newDate)
  if (Number.isNaN(parsedDate.getTime())) {
    return Response.json({ error: 'newDate is not a valid date' }, { status: 400 })
  }

  const existing = await prisma.fabricOut.findFirst({
    where: { vatType, vatNo: Number(vatNo), deletedAt: null },
    orderBy: { id: 'asc' },
    select: { createDate: true },
  })
  if (!existing) {
    return Response.json({ error: `ไม่พบบิล ${vatType}-${vatNo}` }, { status: 404 })
  }

  const oldDate = existing.createDate

  await prisma.$transaction([
    prisma.fabricOut.updateMany({
      where: { vatType, vatNo: Number(vatNo), deletedAt: null },
      data: { createDate: parsedDate },
    }),
    prisma.auditLog.create({
      data: {
        tableName: TABLE_NAME,
        recordKey: recordKey(vatType, Number(vatNo)),
        fieldName: FIELD_NAME,
        oldValue: oldDate.toISOString(),
        newValue: parsedDate.toISOString(),
        changedBy: session.user?.email ?? session.user?.name ?? 'unknown',
      },
    }),
  ])

  return Response.json({ ok: true, createDate: parsedDate.toISOString() })
}
