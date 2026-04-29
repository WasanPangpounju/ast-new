import type { SoVatType } from '@/types'
import { prisma } from '@/lib/prisma'

/** Generate next SO number for given vat type */
export async function nextSoNumber(vatType: SoVatType): Promise<string> {
  // TODO: implement — logic documented in analysis
  throw new Error('nextSoNumber: not implemented yet')
}

/** Get order status from fabric_ast_structures.yarnWRatio2 */
export async function getOrderStatus(orderId: number): Promise<string> {
  // TODO: implement
  throw new Error('getOrderStatus: not implemented yet')
}
