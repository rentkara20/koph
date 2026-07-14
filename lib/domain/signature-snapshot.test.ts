import { describe, it, expect } from "vitest"
import {
  buildSignatureSnapshot,
  parseSignatureSnapshot,
  type BuildSnapshotInput,
} from "./signature-snapshot"

const base: BuildSnapshotInput = {
  requestNumber: "REQ-1",
  quoteNumber: "Q-1",
  customer: { name: "Acme", contactPerson: "Ali", mobile: "0555", city: "Riyadh" },
  items: [
    {
      id: "i1",
      description: "Laptop",
      brand: "Dell",
      model: "X",
      serialNumber: "SN1",
      quantity: 2,
      accessories: "charger",
      condition: "good",
      receivedQuantity: 2,
    },
  ],
  deliveryOutcome: "full_no_remarks",
  remarks: null,
  signer: { fullName: "Ali", position: "Manager", nationalId: "12345" },
  signedAt: 1000,
}

describe("buildSignatureSnapshot", () => {
  it("freezes items, customer, outcome and signer", () => {
    const snap = buildSignatureSnapshot(base)
    expect(snap.version).toBe(1)
    expect(snap.items).toHaveLength(1)
    expect(snap.items[0].serialNumber).toBe("SN1")
    expect(snap.deliveryOutcome).toBe("full_no_remarks")
    expect(snap.signer.position).toBe("Manager")
  })

  it("round-trips through JSON via parseSignatureSnapshot", () => {
    const json = JSON.stringify(buildSignatureSnapshot(base))
    const parsed = parseSignatureSnapshot(json)
    expect(parsed?.requestNumber).toBe("REQ-1")
    expect(parsed?.items[0].description).toBe("Laptop")
  })

  it("snapshot is independent of later source mutation (structural copy)", () => {
    const input = { ...base, items: [{ ...base.items[0] }] }
    const snap = buildSignatureSnapshot(input)
    input.items[0].description = "CHANGED"
    expect(snap.items[0].description).toBe("Laptop")
  })
})

describe("parseSignatureSnapshot", () => {
  it("returns null for absent or malformed data (legacy rows)", () => {
    expect(parseSignatureSnapshot(null)).toBeNull()
    expect(parseSignatureSnapshot("not json")).toBeNull()
    expect(parseSignatureSnapshot(JSON.stringify({ version: 2 }))).toBeNull()
  })
})
