// Shared idempotency-key helper — used by any write endpoint that needs to
// survive a client retrying the exact same "one button click" action (e.g.
// after a lost response) without duplicating its side effect.
//
// requestId is a client-generated token minted fresh per save ATTEMPT and
// reused only when retrying that same still-pending attempt. It is distinct
// from fabricouts.refId, which intentionally spans a whole bill session
// across multiple separate saves (see api/warehouse/bill/route.ts) — do not
// conflate the two.
import { Prisma } from '@/generated/prisma/client/client'

export class DuplicateRequestError extends Error {
  constructor() {
    super('duplicate request — already processed')
    this.name = 'DuplicateRequestError'
  }
}

/**
 * Claims `requestId` for `endpoint` inside the CALLER's transaction (tx).
 * Must be called INSIDE the same $transaction as the actual side-effecting
 * write — the unique constraint on `requestId` is what makes a concurrent or
 * retried claim fail atomically alongside (and roll back with) that write.
 * Throws DuplicateRequestError if already claimed (Prisma P2002).
 */
export async function claimRequestId(
  tx: Prisma.TransactionClient,
  requestId: string,
  endpoint: string,
): Promise<void> {
  try {
    await tx.requestIdempotency.create({ data: { requestId, endpoint } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new DuplicateRequestError()
    }
    throw err
  }
}
