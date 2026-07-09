// Pure payment-batch math, extracted from lib/actions/payments.ts so batch-total
// integrity can be unit-tested without the DB. The batch total must always equal
// the sum of the line items that still belong to it; a held item is pulled out
// of the batch (status on_hold, batchId nulled) and must NOT count toward the
// total. Before OI-0, holdPayment nulled the batchId but never recomputed the
// total, so a held item left the batch total overstated.

export type PaymentStatus = "pending" | "batched" | "paid" | "on_hold"

export interface PaymentLike {
  totalAmount: number
  status: PaymentStatus
}

// Amount a batch should report: only line items that are still part of it —
// batched (awaiting payment) or already paid. Held/removed items are excluded.
export function sumBatchTotal(payments: ReadonlyArray<PaymentLike>): number {
  return payments
    .filter((p) => p.status === "batched" || p.status === "paid")
    .reduce((sum, p) => sum + p.totalAmount, 0)
}
