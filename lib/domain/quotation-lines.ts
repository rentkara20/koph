// Quotation-line integrity (Sourcing V2 Phase 4). Pure guard: every quoted
// line must answer an item the RFQ actually carried, and no item may be quoted
// twice in one quotation. FK PRAGMA is off, so the caller runs this against the
// RFQ's real item set before writing lines.

export type QuotationLineCheck = { sourcingRequestItemId: string }

export type QuotationLineValidation =
  | { ok: true }
  | { ok: false; error: "item_not_in_rfq" | "duplicate_item" }

export function validateQuotationLineItems(
  lines: QuotationLineCheck[],
  rfqItemIds: ReadonlySet<string>
): QuotationLineValidation {
  const seen = new Set<string>()
  for (const line of lines) {
    if (!rfqItemIds.has(line.sourcingRequestItemId)) {
      return { ok: false, error: "item_not_in_rfq" }
    }
    if (seen.has(line.sourcingRequestItemId)) {
      return { ok: false, error: "duplicate_item" }
    }
    seen.add(line.sourcingRequestItemId)
  }
  return { ok: true }
}
