import { describe, expect, it } from "vitest"
import { buildAwardedPurchaseOrderDraft } from "./purchase-order-draft"

describe("buildAwardedPurchaseOrderDraft", () => {
  it("reuses the ERP reference and keeps only the awarded lines for this case supplier", () => {
    expect(
      buildAwardedPurchaseOrderDraft({
        caseSupplierId: "supplier-a",
        externalPoRef: "  PO-1243  ",
        awardedLines: [
          { supplierId: "supplier-a", itemDescription: "Laptop", qty: 2, unitPrice: 2100 },
          { supplierId: "supplier-b", itemDescription: "Monitor", qty: 1, unitPrice: 800 },
        ],
      })
    ).toEqual({
      supplierId: "supplier-a",
      poNumber: "PO-1243",
      lines: [{ itemDescription: "Laptop", qty: 2, unitPrice: 2100 }],
    })
  })

  it("rejects a case that has no awarded lines for its supplier", () => {
    expect(() =>
      buildAwardedPurchaseOrderDraft({
        caseSupplierId: "supplier-a",
        externalPoRef: "PO-1244",
        awardedLines: [
          { supplierId: "supplier-b", itemDescription: "Monitor", qty: 1, unitPrice: 800 },
        ],
      })
    ).toThrow("No awarded quotation lines found for this supplier")
  })
})
