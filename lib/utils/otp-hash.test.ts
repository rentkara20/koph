import { describe, it, expect } from "vitest"
import { generateOtpCode, hashOtp, hashesEqual, OTP_LENGTH } from "./otp-hash"

describe("generateOtpCode", () => {
  it("produces a zero-padded 6-digit numeric code", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode()
      expect(code).toHaveLength(OTP_LENGTH)
      expect(/^\d{6}$/.test(code)).toBe(true)
    }
  })
})

describe("hashOtp", () => {
  it("is deterministic for the same inputs", async () => {
    const a = await hashOtp("sig1", "123456", "secret")
    const b = await hashOtp("sig1", "123456", "secret")
    expect(a).toBe(b)
  })

  it("differs when code, sig id, or secret differ", async () => {
    const base = await hashOtp("sig1", "123456", "secret")
    expect(await hashOtp("sig1", "654321", "secret")).not.toBe(base)
    expect(await hashOtp("sig2", "123456", "secret")).not.toBe(base)
    expect(await hashOtp("sig1", "123456", "other")).not.toBe(base)
  })

  it("never contains the plaintext code", async () => {
    const hash = await hashOtp("sig1", "483920", "secret")
    expect(hash).not.toContain("483920")
  })
})

describe("hashesEqual", () => {
  it("matches identical hashes and rejects mismatches / nulls", async () => {
    const h = await hashOtp("sig1", "123456", "secret")
    expect(hashesEqual(h, h)).toBe(true)
    expect(hashesEqual(h, h.slice(0, -1) + "0")).toBe(false)
    expect(hashesEqual(h, null)).toBe(false)
    expect(hashesEqual(null, null)).toBe(false)
  })
})
