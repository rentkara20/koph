import { describe, expect, it } from "vitest"
import { rfqEmail } from "./templates"

describe("rfqEmail", () => {
  it("wraps plain text in the KARA layout and preserves line breaks safely", () => {
    const html = rfqEmail({ body: "مرحباً أحمد\n• 2× Laptop <script>alert(1)</script>" })

    expect(html).toContain("KARA · KOPH")
    expect(html).toContain("white-space:pre-wrap")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<script>")
  })
})
