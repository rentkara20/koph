import { describe, expect, test } from "vitest"
import {
  DEFAULT_SIGNATURE_CHANNEL,
  SIGNATURE_CHANNELS,
  SYSTEM_DEFAULT_CHANNEL_POLICIES,
  isSignatureChannel,
  resolveSignaturePolicy,
  signatureExpiresAt,
  toSigningGeoColumns,
} from "./signature-channel"

describe("signature channels", () => {
  test("exactly three channels — email_attachment is deliberately not one", () => {
    expect([...SIGNATURE_CHANNELS]).toEqual(["agent_device", "customer_link", "email_link"])
    expect(isSignatureChannel("email_attachment")).toBe(false)
    expect(isSignatureChannel("agent_device")).toBe(true)
    expect(DEFAULT_SIGNATURE_CHANNEL).toBe("agent_device")
  })

  test("agent_device default reproduces the behaviour the on-site path hardcoded", () => {
    // The pre-channel on-site flow forced requireNationalId and had no expiry.
    // Existing signed notes must remain explainable by the policy that now
    // replaces that hardcoding.
    expect(SYSTEM_DEFAULT_CHANNEL_POLICIES.agent_device.requireNationalId).toBe(true)
    expect(SYSTEM_DEFAULT_CHANNEL_POLICIES.agent_device.expiryEnabled).toBe(false)
  })

  test("remote channels are OTP-gated and expiring; email_link is the longest window", () => {
    expect(SYSTEM_DEFAULT_CHANNEL_POLICIES.customer_link.otpEnabled).toBe(true)
    expect(SYSTEM_DEFAULT_CHANNEL_POLICIES.customer_link.expiryEnabled).toBe(true)
    expect(SYSTEM_DEFAULT_CHANNEL_POLICIES.email_link.otpEnabled).toBe(true)
    expect(SYSTEM_DEFAULT_CHANNEL_POLICIES.email_link.ttlHours).toBeGreaterThan(
      SYSTEM_DEFAULT_CHANNEL_POLICIES.customer_link.ttlHours
    )
  })
})

describe("resolveSignaturePolicy", () => {
  test("untouched channel follows the code default", () => {
    expect(resolveSignaturePolicy("customer_link", {}, null)).toEqual(
      SYSTEM_DEFAULT_CHANNEL_POLICIES.customer_link
    )
  })

  test("stored setting overrides the default, per field only", () => {
    const resolved = resolveSignaturePolicy("email_link", { email_link: { ttlHours: 48 } })
    expect(resolved.ttlHours).toBe(48)
    // Untouched fields keep the default rather than being reset.
    expect(resolved.otpEnabled).toBe(SYSTEM_DEFAULT_CHANNEL_POLICIES.email_link.otpEnabled)
    expect(resolved.reminderEnabled).toBe(true)
  })

  test("per-request override beats the stored setting", () => {
    const resolved = resolveSignaturePolicy(
      "agent_device",
      { agent_device: { requireNationalId: true } },
      { requireNationalId: false }
    )
    expect(resolved.requireNationalId).toBe(false)
  })

  test("undefined never overrides — toggling one flag cannot reset the rest", () => {
    const resolved = resolveSignaturePolicy("agent_device", null, {
      otpEnabled: true,
      requireNationalId: undefined,
    })
    expect(resolved.otpEnabled).toBe(true)
    expect(resolved.requireNationalId).toBe(true)
  })

  test("a non-positive stored ttl falls back to the default instead of expiring instantly", () => {
    const resolved = resolveSignaturePolicy("customer_link", { customer_link: { ttlHours: 0 } })
    expect(resolved.ttlHours).toBe(SYSTEM_DEFAULT_CHANNEL_POLICIES.customer_link.ttlHours)
  })

  test("a stored policy for another channel does not leak", () => {
    const resolved = resolveSignaturePolicy("agent_device", { email_link: { otpEnabled: true } })
    expect(resolved.otpEnabled).toBe(false)
  })
})

describe("signatureExpiresAt", () => {
  test("null when expiry is off, regardless of ttl", () => {
    expect(signatureExpiresAt({ ...SYSTEM_DEFAULT_CHANNEL_POLICIES.agent_device }, 1_000)).toBeNull()
  })

  test("now + ttl when expiry is on", () => {
    const policy = { ...SYSTEM_DEFAULT_CHANNEL_POLICIES.customer_link, ttlHours: 2 }
    expect(signatureExpiresAt(policy, 1_000)).toBe(1_000 + 2 * 3_600_000)
  })
})

describe("toSigningGeoColumns", () => {
  test("a fix is stored with accuracy and no reason", () => {
    expect(toSigningGeoColumns({ latitude: 24.7136, longitude: 46.6753, accuracy: 12.5 })).toEqual({
      geoLatitude: 24.7136,
      geoLongitude: 46.6753,
      geoAccuracy: 12.5,
      geoUnavailableReason: null,
    })
  })

  test("a refusal records the reason, not silence", () => {
    const cols = toSigningGeoColumns({ unavailableReason: "denied" })
    expect(cols.geoUnavailableReason).toBe("denied")
    expect(cols.geoLatitude).toBeNull()
  })

  test("an omitted geo (older client) is 'unsupported', not silently empty", () => {
    expect(toSigningGeoColumns(undefined).geoUnavailableReason).toBe("unsupported")
    expect(toSigningGeoColumns(null).geoUnavailableReason).toBe("unsupported")
  })

  test("out-of-range or non-finite coordinates degrade to unavailable, never throw", () => {
    expect(toSigningGeoColumns({ latitude: 91, longitude: 0, accuracy: null }).geoUnavailableReason).toBe("unavailable")
    expect(toSigningGeoColumns({ latitude: 0, longitude: 181, accuracy: null }).geoUnavailableReason).toBe("unavailable")
    expect(toSigningGeoColumns({ latitude: NaN, longitude: 0, accuracy: null }).geoUnavailableReason).toBe("unavailable")
  })

  test("an unknown reason string is normalised rather than stored raw", () => {
    const cols = toSigningGeoColumns({ unavailableReason: "banana" as never })
    expect(cols.geoUnavailableReason).toBe("error")
  })

  test("a non-finite accuracy keeps the coordinates and drops only the accuracy", () => {
    const cols = toSigningGeoColumns({ latitude: 24.7, longitude: 46.7, accuracy: NaN })
    expect(cols.geoLatitude).toBe(24.7)
    expect(cols.geoAccuracy).toBeNull()
  })
})
