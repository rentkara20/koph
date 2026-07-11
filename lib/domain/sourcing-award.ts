// Per-item award guards (Sourcing V2 Phase 5). Pure validation for awarding a
// request item to a specific quotation line. The award itself lives in
// commercial_evaluation_line (append-only, single source of truth); an item is
// "selected" purely because it has an award under the active evaluation.
// FK PRAGMA is off, so the caller checks membership here before writing.

export const AWARD_REASONS = ["lowest_price", "fastest_delivery", "recommended", "manual"] as const
export type AwardReason = (typeof AWARD_REASONS)[number]

export type AwardInput = {
  sourcingRequestItemId: string
  quotationLineId: string
  reason: AwardReason
}

// The facts the caller has loaded from the DB about a candidate quotation line.
export type QuotationLineFact = {
  quotationLineId: string
  // Which request item this quotation line actually quoted.
  sourcingRequestItemId: string
}

export type AwardValidation =
  | { ok: true }
  | {
      ok: false
      error: "duplicate_item" | "unknown_line" | "line_item_mismatch"
    }

// Every award must reference a quotation line that (a) exists among the
// request's quotation lines and (b) actually quoted the item being awarded.
// No item may be awarded twice in one submission.
export function validateAwards(
  awards: AwardInput[],
  linesByLineId: ReadonlyMap<string, QuotationLineFact>
): AwardValidation {
  const seenItems = new Set<string>()
  for (const award of awards) {
    if (seenItems.has(award.sourcingRequestItemId)) {
      return { ok: false, error: "duplicate_item" }
    }
    seenItems.add(award.sourcingRequestItemId)

    const line = linesByLineId.get(award.quotationLineId)
    if (!line) return { ok: false, error: "unknown_line" }
    if (line.sourcingRequestItemId !== award.sourcingRequestItemId) {
      return { ok: false, error: "line_item_mismatch" }
    }
  }
  return { ok: true }
}
