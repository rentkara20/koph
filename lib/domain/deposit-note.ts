// Optional "financial security deposit" block on a KARA rental delivery note.
//
// OPT-IN per signature request (default OFF: the delivery note stays exactly as
// today). Each line carries a per-device price defaulting to its purchase cost
// but editable by an admin. Frozen into the immutable signing snapshot so a
// later purchase-cost edit never rewrites an already-signed receipt.
//
// Pure module (no DB import), mirroring lib/domain/signature-snapshot.ts.

import { z } from "zod"

export type DepositNoteLine = { itemId: string; label: string; amount: number }

export type DepositNote = {
  version: 1
  enabled: boolean
  currency: string
  title: string
  showTotal: boolean
  showRefundTerms: boolean
  lines: DepositNoteLine[]
  note: string | null
}

export const DEFAULT_DEPOSIT_CURRENCY = "SAR"
export const DEFAULT_DEPOSIT_TITLE =
  "مبلغ تأمين مالي مسترد · Refundable financial security deposit"

// Fixed refund-condition wording shown (optionally) at the end of the deposit
// block. Kept as a constant — not free text — so every note carries the same
// legally-consistent terms in both languages.
export const DEPOSIT_REFUND_TERMS_EN =
  "Refunded in full on return in good condition; retained if the device is damaged, lost, or not returned."
export const DEPOSIT_REFUND_TERMS_AR =
  "يُسترد بالكامل عند إرجاع الجهاز بحالة سليمة، ويُحتجز في حال تلف الجهاز أو فقده أو عدم إرجاعه."

export const depositNoteLineSchema = z.object({
  itemId: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(300),
  // Non-negative real amounts.
  amount: z.number().min(0).max(100_000_000),
})

export const depositNoteSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  currency: z.string().trim().min(1).max(10),
  title: z.string().trim().min(1).max(300),
  showTotal: z.boolean(),
  // Defaulted so notes stored before this field parse cleanly (missing → on).
  showRefundTerms: z.boolean().default(true),
  lines: z.array(depositNoteLineSchema).max(500),
  note: z.string().trim().max(2000).nullable(),
})

/**
 * Safe parse of a stored deposit note.
 * Returns null when absent, malformed, version-mismatched, or disabled — so a
 * disabled/legacy note renders nothing.
 */
export function parseDepositNote(raw: string | null | undefined): DepositNote | null {
  if (!raw) return null
  try {
    const parsed = depositNoteSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    if (!parsed.data.enabled) return null
    return parsed.data
  } catch {
    return null
  }
}

/** Grand total of all line amounts. */
export function computeDepositTotal(lines: DepositNoteLine[]): number {
  return lines.reduce((sum, line) => sum + (line.amount || 0), 0)
}
