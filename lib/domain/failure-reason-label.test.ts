import { describe, it, expect } from "vitest"
import { failureReasonLabel, type FailureReasonLabels } from "./failure-reason-label"

const labels: FailureReasonLabels = {
  customer_unavailable: { nameEn: "Customer unavailable", nameAr: "العميل غير متوفر" },
  site_flooded: { nameEn: "Site flooded", nameAr: "الموقع غارق بالمياه" },
}

describe("failureReasonLabel", () => {
  it("returns the Arabic name for the ar locale", () => {
    expect(failureReasonLabel(labels, "customer_unavailable", "ar")).toBe("العميل غير متوفر")
  })

  it("returns the English name for the en locale", () => {
    expect(failureReasonLabel(labels, "customer_unavailable", "en")).toBe("Customer unavailable")
  })

  it("resolves an admin-added reason that no hardcoded list would know", () => {
    expect(failureReasonLabel(labels, "site_flooded", "ar")).toBe("الموقع غارق بالمياه")
  })

  it("humanizes an unknown slug instead of leaking a raw key", () => {
    expect(failureReasonLabel(labels, "reason_deleted_later", "ar")).toBe("reason deleted later")
  })
})
