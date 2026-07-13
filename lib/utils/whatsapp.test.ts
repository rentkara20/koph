import { describe, expect, test } from "vitest"
import { normalizeSaudiMobile, buildWhatsappUrl, partnerPickupAssignmentMessage } from "./whatsapp"

describe("normalizeSaudiMobile", () => {
  test("normalizes local and international forms", () => {
    expect(normalizeSaudiMobile("0544909444")).toBe("966544909444")
    expect(normalizeSaudiMobile("+966544909444")).toBe("966544909444")
    expect(normalizeSaudiMobile("00966544909444")).toBe("966544909444")
    expect(normalizeSaudiMobile("544909444")).toBe("966544909444")
    expect(normalizeSaudiMobile("")).toBeNull()
  })
})

describe("partnerPickupAssignmentMessage", () => {
  test("includes PO, supplier, address, contact, maps, items, destination, link", () => {
    const msg = partnerPickupAssignmentMessage({
      partnerName: "Ahmad",
      poNumber: "PO-1001",
      supplierName: "Mindware",
      pickupAddress: "Olaya St",
      pickupContactName: "Sami",
      pickupContactMobile: "0555555555",
      pickupMapsUrl: "https://maps.example/x",
      destinationLocation: "main_warehouse",
      itemsSummary: "Monitor ×20",
      taskLink: "https://koph.app/task/abc",
    })
    expect(msg).toContain("PO-1001")
    expect(msg).toContain("Mindware")
    expect(msg).toContain("Olaya St")
    expect(msg).toContain("Sami")
    expect(msg).toContain("https://maps.example/x")
    expect(msg).toContain("Monitor ×20")
    expect(msg).toContain("main_warehouse")
    expect(msg).toContain("https://koph.app/task/abc")
  })

  test("wa.me url is built from a normalized number", () => {
    const url = buildWhatsappUrl("0544909444", "hi")
    expect(url).toContain("https://wa.me/966544909444")
  })
})
