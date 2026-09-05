import { describe, expect, test } from "vitest"
import {
  DEFAULT_SIGNATURE_CHANNEL,
  LEGACY_SIGNATURE_CHANNEL,
  STORED_SIGNATURE_CHANNELS,
  assignableChannel,
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

describe("legacy_unknown — rows that predate the column", () => {
  test("it is stored and reportable, but never assignable", () => {
    expect([...STORED_SIGNATURE_CHANNELS]).toContain(LEGACY_SIGNATURE_CHANNEL)
    // The assignable set is what a caller may choose from, and it excludes it.
    expect([...SIGNATURE_CHANNELS]).not.toContain(LEGACY_SIGNATURE_CHANNEL as never)
    expect(isSignatureChannel(LEGACY_SIGNATURE_CHANNEL)).toBe(false)
  })

  test("assignableChannel narrows a legacy or unknown value to the default", () => {
    expect(assignableChannel(LEGACY_SIGNATURE_CHANNEL)).toBe("agent_device")
    expect(assignableChannel(null)).toBe("agent_device")
    expect(assignableChannel(undefined)).toBe("agent_device")
    expect(assignableChannel("something_else")).toBe("agent_device")
  })

  test("assignableChannel passes a real channel through untouched", () => {
    expect(assignableChannel("email_link")).toBe("email_link")
  })

  test("resolving a policy for a legacy row falls back instead of crashing", () => {
    // Reached when stage-2 signoff inherits a legacy parent's channel.
    expect(resolveSignaturePolicy(LEGACY_SIGNATURE_CHANNEL)).toEqual(
      SYSTEM_DEFAULT_CHANNEL_POLICIES.agent_device
    )
  })

  test("a stored policy keyed by the default channel still applies to a legacy row", () => {
    const resolved = resolveSignaturePolicy(LEGACY_SIGNATURE_CHANNEL, {
      agent_device: { requireNationalId: false },
    })
    expect(resolved.requireNationalId).toBe(false)
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
    const cols = toSigningGeoColumns({ unavailableReason: "user_denied" })
    expect(cols.geoUnavailableReason).toBe("user_denied")
    expect(cols.geoLatitude).toBeNull()
  })

  test("an environment block is stored as its own reason, not as a refusal", () => {
    const cols = toSigningGeoColumns({ unavailableReason: "policy_blocked" })
    expect(cols.geoUnavailableReason).toBe("policy_blocked")
    expect(cols.geoUnavailableReason).not.toBe("user_denied")
  })

  test("an unrecognised reason degrades to 'unknown', never to a refusal", () => {
    const cols = toSigningGeoColumns({
      unavailableReason: "denied" as never,
    })
    expect(cols.geoUnavailableReason).toBe("unknown")
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
    expect(cols.geoUnavailableReason).toBe("unknown")
  })

  test("a non-finite accuracy keeps the coordinates and drops only the accuracy", () => {
    const cols = toSigningGeoColumns({ latitude: 24.7, longitude: 46.7, accuracy: NaN })
    expect(cols.geoLatitude).toBe(24.7)
    expect(cols.geoAccuracy).toBeNull()
  })
})
