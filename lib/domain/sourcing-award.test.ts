import { describe, expect, test } from "vitest"
import { validateAwards, type QuotationLineFact } from "./sourcing-award"

const lines = new Map<string, QuotationLineFact>([
  ["line-a1", { quotationLineId: "line-a1", sourcingRequestItemId: "item-a" }],
  ["line-a2", { quotationLineId: "line-a2", sourcingRequestItemId: "item-a" }],
  ["line-b1", { quotationLineId: "line-b1", sourcingRequestItemId: "item-b" }],
])

describe("validateAwards", () => {
  test("accepts one award per item pointing at a line that quoted that item", () => {
    expect(
      validateAwards(
        [
          { sourcingRequestItemId: "item-a", quotationLineId: "line-a2", reason: "lowest_price" },
          { sourcingRequestItemId: "item-b", quotationLineId: "line-b1", reason: "recommended" },
        ],
        lines
      )
    ).toEqual({ ok: true })
  })

  test("rejects awarding the same item twice", () => {
    expect(
      validateAwards(
        [
          { sourcingRequestItemId: "item-a", quotationLineId: "line-a1", reason: "manual" },
          { sourcingRequestItemId: "item-a", quotationLineId: "line-a2", reason: "manual" },
        ],
        lines
      )
    ).toEqual({ ok: false, error: "duplicate_item" })
  })

  test("rejects an unknown quotation line", () => {
    expect(
      validateAwards(
        [{ sourcingRequestItemId: "item-a", quotationLineId: "ghost", reason: "manual" }],
        lines
      )
    ).toEqual({ ok: false, error: "unknown_line" })
  })

  test("rejects a line that quoted a different item", () => {
    expect(
      validateAwards(
        [{ sourcingRequestItemId: "item-a", quotationLineId: "line-b1", reason: "manual" }],
        lines
      )
    ).toEqual({ ok: false, error: "line_item_mismatch" })
  })
})
