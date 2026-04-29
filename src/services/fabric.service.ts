import { prisma } from '@/lib/prisma'
import type { VatInvoiceType } from '@/types'

export async function nextVatNo(vatType: VatInvoiceType): Promise<number> {
  // TODO: implement
  throw new Error('nextVatNo: not implemented yet')
}

export async function saveFabricChunk(
  yards: number[],
  startFold: number,
  refId: string,
  meta: Record<string, unknown>
): Promise<void> {
  // TODO: implement
  throw new Error('saveFabricChunk: not implemented yet')
}
