import { describe, it, expect } from "vitest"
import { splitDocumentName, localizeDocumentName } from "./document-name"

const AR = { deliveryNote: "سند تسليم", collectionReceipt: "سند استلام" } as const
const t = (k: "deliveryNote" | "collectionReceipt") => AR[k]

describe("splitDocumentName", () => {
  it("recognises a collection receipt and keeps its identifying tail", () => {
    expect(splitDocumentName("Collection Receipt #10697 TAM, RUH, P1")).toEqual({
      kind: "collectionReceipt",
      rest: "#10697 TAM, RUH, P1",
    })
  })

  it("recognises a delivery note", () => {
    expect(splitDocumentName("Delivery Note #10693 Al Rajhi, RUH, P2").kind).toBe("deliveryNote")
  })

  it("returns no kind for a hand-typed name rather than guessing", () => {
    expect(splitDocumentName("عقد إيجار خاص")).toEqual({ kind: null, rest: "عقد إيجار خاص" })
  })

  it("treats a missing name as empty", () => {
    expect(splitDocumentName(null)).toEqual({ kind: null, rest: "" })
  })
})

describe("localizeDocumentName", () => {
  it("translates only the kind phrase, never the identifying tail", () => {
    expect(localizeDocumentName("Collection Receipt #10697 TAM, RUH, P1", t)).toBe(
      "سند استلام #10697 TAM, RUH, P1"
    )
  })

  it("passes an unrecognised name through untouched", () => {
    expect(localizeDocumentName("Rental Agreement 4", t)).toBe("Rental Agreement 4")
  })

  it("renders a bare kind with no tail", () => {
    expect(localizeDocumentName("Delivery Note", t)).toBe("سند تسليم")
  })
})
