import { describe, expect, it } from "vitest"
import { resolveAdminReturnPath } from "./admin-return-path"

describe("resolveAdminReturnPath", () => {
  it("keeps an internal admin page as the return destination", () => {
    expect(resolveAdminReturnPath("/admin/requests/req-1", "/admin/customers")).toBe(
      "/admin/requests/req-1"
    )
  })

  it("rejects external and malformed return destinations", () => {
    expect(resolveAdminReturnPath("https://example.com", "/admin/customers")).toBe(
      "/admin/customers"
    )
    expect(resolveAdminReturnPath("//example.com", "/admin/customers")).toBe(
      "/admin/customers"
    )
  })
})
