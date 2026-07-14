import { describe, it, expect, beforeAll } from "vitest"
import { decideOtpVerification, type OtpRecord } from "./otp-verification"
import { hashOtp } from "@/lib/utils/otp-hash"

const SECRET = "test-secret"
const SIG_ID = "sig-1"
const CODE = "482913"
let goodHash = ""

beforeAll(async () => {
  goodHash = await hashOtp(SIG_ID, CODE, SECRET)
})

function rec(over: Partial<OtpRecord> = {}): OtpRecord {
  return {
    id: SIG_ID,
    otpHash: goodHash,
    otpExpiresAt: 10_000,
    otpAttempts: 0,
    otpVerifiedAt: null,
    ...over,
  }
}

describe("decideOtpVerification", () => {
  it("verifies a correct, unexpired, unlocked code", async () => {
    const d = await decideOtpVerification(rec(), CODE, 5_000, SECRET)
    expect(d.kind).toBe("verified")
  })

  it("is idempotent once already verified", async () => {
    const d = await decideOtpVerification(rec({ otpVerifiedAt: 4_000 }), CODE, 5_000, SECRET)
    expect(d.kind).toBe("already_verified")
  })

  it("rejects an expired code", async () => {
    const d = await decideOtpVerification(rec({ otpExpiresAt: 1_000 }), CODE, 5_000, SECRET)
    expect(d.kind).toBe("expired")
  })

  it("locks after the maximum attempts", async () => {
    const d = await decideOtpVerification(rec({ otpAttempts: 5 }), CODE, 5_000, SECRET)
    expect(d.kind).toBe("locked")
  })

  it("reports remaining attempts on a wrong code", async () => {
    const d = await decideOtpVerification(rec({ otpAttempts: 1 }), "000000", 5_000, SECRET)
    expect(d).toEqual({ kind: "mismatch", attemptsLeft: 3 })
  })

  it("reaches zero attempts left on the fifth wrong try", async () => {
    const d = await decideOtpVerification(rec({ otpAttempts: 4 }), "000000", 5_000, SECRET)
    expect(d).toEqual({ kind: "mismatch", attemptsLeft: 0 })
  })

  it("does not match a code hashed for a different signature id", async () => {
    const otherHash = await hashOtp("sig-2", CODE, SECRET)
    const d = await decideOtpVerification(rec({ otpHash: otherHash }), CODE, 5_000, SECRET)
    expect(d.kind).toBe("mismatch")
  })
})
