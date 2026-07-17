import { describe, expect, it } from "vitest"
import { resolveTaskContactId } from "./task-contact"

describe("resolveTaskContactId", () => {
  it("uses the request contact when assigning a courier without another choice", () => {
    expect(resolveTaskContactId(undefined, "receiver-1")).toBe("receiver-1")
  })

  it("keeps an explicitly selected contact", () => {
    expect(resolveTaskContactId("contact-2", "receiver-1")).toBe("contact-2")
  })

  it("returns null when the request has no contact", () => {
    expect(resolveTaskContactId(undefined, null)).toBeNull()
  })
})
