export type AwardedPurchaseOrderLine = {
  supplierId: string
  itemDescription: string
  qty: number
  unitPrice: number | null
}

export function buildAwardedPurchaseOrderDraft(input: {
  caseSupplierId: string
  externalPoRef: string
  awardedLines: AwardedPurchaseOrderLine[]
}) {
  const lines = input.awardedLines
    .filter((line) => line.supplierId === input.caseSupplierId)
    .map(({ itemDescription, qty, unitPrice }) => ({ itemDescription, qty, unitPrice }))

  if (lines.length === 0) {
    throw new Error("No awarded quotation lines found for this supplier")
  }

  return {
    supplierId: input.caseSupplierId,
    poNumber: input.externalPoRef.trim(),
    lines,
  }
}
