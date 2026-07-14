// Immutable frozen snapshot of a signed delivery receipt.
//
// The delivery note is otherwise rendered from live request/item/customer rows,
// so a later edit to the request would silently rewrite an already-signed
// historical receipt. At signing time we freeze exactly what was presented into
// customer_signature.snapshot (JSON) and render that in preference to live data.
//
// Pure builder — callers pass the already-fetched rows so it stays unit-testable
// and free of DB access.

export type SnapshotItem = {
  id: string
  description: string
  brand: string | null
  model: string | null
  serialNumber: string | null
  quantity: number
  accessories: string | null
  condition: "good" | "damaged" | "missing" | null
  receivedQuantity: number | null
}

export type DeliveryOutcome =
  | "full_no_remarks"
  | "full_with_remarks"
  | "partial"
  | "refused"

export type SignatureSnapshot = {
  version: 1
  requestNumber: string | null
  quoteNumber: string | null
  customer: {
    name: string | null
    contactPerson: string | null
    mobile: string | null
    city: string | null
  } | null
  items: SnapshotItem[]
  deliveryOutcome: DeliveryOutcome | null
  remarks: string | null
  signer: {
    fullName: string
    position: string | null
    nationalId: string | null
  }
  signedAt: number
}

export type BuildSnapshotInput = {
  requestNumber: string | null
  quoteNumber: string | null
  customer: SignatureSnapshot["customer"]
  items: SnapshotItem[]
  deliveryOutcome: DeliveryOutcome | null
  remarks: string | null
  signer: SignatureSnapshot["signer"]
  signedAt: number
}

export function buildSignatureSnapshot(input: BuildSnapshotInput): SignatureSnapshot {
  return {
    version: 1,
    requestNumber: input.requestNumber,
    quoteNumber: input.quoteNumber,
    customer: input.customer,
    items: input.items.map((i) => ({
      id: i.id,
      description: i.description,
      brand: i.brand,
      model: i.model,
      serialNumber: i.serialNumber,
      quantity: i.quantity,
      accessories: i.accessories,
      condition: i.condition,
      receivedQuantity: i.receivedQuantity,
    })),
    deliveryOutcome: input.deliveryOutcome,
    remarks: input.remarks,
    signer: input.signer,
    signedAt: input.signedAt,
  }
}

/** Safe parse of a stored snapshot; null when absent or malformed (legacy rows). */
export function parseSignatureSnapshot(raw: string | null | undefined): SignatureSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SignatureSnapshot
    if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) return parsed
    return null
  } catch {
    return null
  }
}
