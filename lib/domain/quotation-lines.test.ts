import { describe, expect, test } from "vitest"
import { validateQuotationLineItems } from "./quotation-lines"

const rfqItems = new Set(["item-a", "item-b"])

describe("validateQuotationLineItems", () => {
  test("accepts lines that all answer items in the RFQ", () => {
    const result = validateQuotationLineItems(
      [{ sourcingRequestItemId: "item-a" }, { sourcingRequestItemId: "item-b" }],
      rfqItems
    )
    expect(result).toEqual({ ok: true })
  })

  test("accepts a subset of the RFQ's items", () => {
    expect(validateQuotationLineItems([{ sourcingRequestItemId: "item-a" }], rfqItems)).toEqual({
      ok: true,
    })
  })

  test("rejects a line for an item the RFQ never carried", () => {
    expect(
      validateQuotationLineItems([{ sourcingRequestItemId: "item-x" }], rfqItems)
    ).toEqual({ ok: false, error: "item_not_in_rfq" })
  })

  test("rejects two lines for the same item", () => {
    expect(
      validateQuotationLineItems(
        [{ sourcingRequestItemId: "item-a" }, { sourcingRequestItemId: "item-a" }],
        rfqItems
      )
    ).toEqual({ ok: false, error: "duplicate_item" })
  })

  test("accepts an empty line list (schema enforces min length elsewhere)", () => {
    expect(validateQuotationLineItems([], rfqItems)).toEqual({ ok: true })
  })
})
