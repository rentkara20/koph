// Signature delivery channels.
//
// A channel is HOW a signature request reached the signer. It is a delivery
// dimension, never a code path: one signing core, one snapshot, one issuance —
// adding a channel adds a value and a policy row, nothing else.
//
// This is deliberately separate from HOW the signature came back, which is
// `customer_signature.signatureMethod` (electronic | manual_upload). A paper
// note that was printed, signed and scanned is `manual_upload` on whatever
// channel delivered the request — not a channel of its own. Likewise, emailing
// a document for review is a `communication_log` row, not a signature channel:
// a channel value that can never reach `signed` would be a dead branch in the
// state machine.

export const SIGNATURE_CHANNELS = ["agent_device", "customer_link", "email_link"] as const
export type SignatureChannel = (typeof SIGNATURE_CHANNELS)[number]

/**
 * The channel of a row that predates the column. Readable and reportable, but
 * never assignable to a new signature request — hence its separation from
 * SIGNATURE_CHANNELS, which is the set a caller may choose from.
 */
export const LEGACY_SIGNATURE_CHANNEL = "legacy_unknown" as const

export const STORED_SIGNATURE_CHANNELS = [...SIGNATURE_CHANNELS, LEGACY_SIGNATURE_CHANNEL] as const
export type StoredSignatureChannel = (typeof STORED_SIGNATURE_CHANNELS)[number]

export const DEFAULT_SIGNATURE_CHANNEL: SignatureChannel = "agent_device"

export function isSignatureChannel(value: unknown): value is SignatureChannel {
  return typeof value === "string" && (SIGNATURE_CHANNELS as readonly string[]).includes(value)
}

/**
 * Narrows a stored channel to one that can be assigned to a NEW request.
 *
 * The case this exists for: stage-2 authorised signoff inherits its parent's
 * channel, and a parent may be a legacy row. Inheriting "legacy_unknown" would
 * either crash policy resolution or propagate an unrecorded value onto a fresh
 * request, so it resolves to the default channel instead.
 */
export function assignableChannel(value: string | null | undefined): SignatureChannel {
  return isSignatureChannel(value) ? value : DEFAULT_SIGNATURE_CHANNEL
}

/**
 * Verification policy for a channel.
 *
 * Channels have different threat models, which is the whole reason the channel
 * drives policy rather than only labelling rows:
 *
 * - `agent_device` — Kara's own courier holds the device at the customer's
 *   site, so the signer's identity is asserted by a Kara employee. National ID
 *   is required and OTP to the recipient's own phone is what makes the identity
 *   independent of the courier.
 * - `customer_link` — the link travels over WhatsApp and is trivially
 *   forwardable, so it is short-lived and OTP-gated.
 * - `email_link` — corporate authorised signatories, shared and delegated
 *   mailboxes, and the highest-value signatures: longer window with reminders,
 *   OTP on a second factor.
 */
export type SignatureChannelPolicy = {
  requireNationalId: boolean
  otpEnabled: boolean
  expiryEnabled: boolean
  /** Link lifetime in hours. Ignored when expiryEnabled is false. */
  ttlHours: number
  reminderEnabled: boolean
}

export const SYSTEM_DEFAULT_CHANNEL_POLICIES: Record<SignatureChannel, SignatureChannelPolicy> = {
  // Matches the behaviour the on-site path hardcoded before channels existed
  // (requireNationalId forced true, no expiry) — now stated as data.
  agent_device: {
    requireNationalId: true,
    otpEnabled: false,
    expiryEnabled: false,
    ttlHours: 72,
    reminderEnabled: false,
  },
  customer_link: {
    requireNationalId: true,
    otpEnabled: true,
    expiryEnabled: true,
    ttlHours: 24,
    reminderEnabled: false,
  },
  email_link: {
    requireNationalId: false,
    otpEnabled: true,
    expiryEnabled: true,
    ttlHours: 168,
    reminderEnabled: true,
  },
}

export type SignaturePolicyOverrides = Partial<SignatureChannelPolicy>

/**
 * Resolves the effective policy: system default ← stored per-channel setting ←
 * per-request override. `undefined` never overrides; only an explicit value
 * does, so an admin toggling one field cannot silently reset the others.
 */
export function resolveSignaturePolicy(
  channel: StoredSignatureChannel,
  stored?: Partial<Record<SignatureChannel, SignaturePolicyOverrides>> | null,
  overrides?: SignaturePolicyOverrides | null
): SignatureChannelPolicy {
  // A legacy row has no policy of its own; fall back to the default channel's.
  const key = assignableChannel(channel)
  const base = SYSTEM_DEFAULT_CHANNEL_POLICIES[key]
  const merged = { ...base, ...pruneUndefined(stored?.[key]), ...pruneUndefined(overrides) }
  return {
    ...merged,
    ttlHours: merged.ttlHours > 0 ? merged.ttlHours : base.ttlHours,
  }
}

/** Absolute expiry for a request created now, or null when expiry is off. */
export function signatureExpiresAt(policy: SignatureChannelPolicy, now: number): number | null {
  if (!policy.expiryEnabled) return null
  return now + policy.ttlHours * 60 * 60 * 1000
}

function pruneUndefined<T extends object>(value: T | null | undefined): Partial<T> {
  if (!value) return {}
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>
}

// ─── Geolocation at the moment of signing ───────────────────────────────────
// Best-effort: a refused or unavailable location NEVER blocks a signature. But
// silence is not acceptable either — an absent location must say why it is
// absent, so "no coordinates" can be told apart from "never asked".

// Why a signature carries no coordinates. These end up in delivery evidence, so
// "the signer refused" must never be recorded for an environment that never
// asked them — a blanket `denied` reads as a decision the person never made.
export const GEO_UNAVAILABLE_REASONS = [
  "user_denied", // the signer was asked and refused
  "policy_blocked", // Permissions-Policy, an insecure origin or a webview
                    // rejected the request before any prompt could appear
  "unavailable", // device/OS could not produce a fix
  "timeout", // took too long
  "unsupported", // no geolocation API in this browser
  "unknown", // reported as denied, but the browser gives us no way to tell
             // a refusal from a block — never assume it was the signer
] as const
export type GeoUnavailableReason = (typeof GEO_UNAVAILABLE_REASONS)[number]

export type SigningGeo =
  | { latitude: number; longitude: number; accuracy: number | null }
  | { unavailableReason: GeoUnavailableReason }

export type SigningGeoColumns = {
  geoLatitude: number | null
  geoLongitude: number | null
  geoAccuracy: number | null
  geoUnavailableReason: GeoUnavailableReason | null
}

/**
 * Normalises whatever the browser handed us into the stored columns. Anything
 * malformed degrades to `unavailable` rather than throwing: losing the reason
 * is acceptable, losing the signature is not.
 */
export function toSigningGeoColumns(geo?: SigningGeo | null): SigningGeoColumns {
  const empty: SigningGeoColumns = {
    geoLatitude: null,
    geoLongitude: null,
    geoAccuracy: null,
    geoUnavailableReason: null,
  }
  if (!geo) return { ...empty, geoUnavailableReason: "unsupported" }

  if ("unavailableReason" in geo) {
    const reason = (GEO_UNAVAILABLE_REASONS as readonly string[]).includes(geo.unavailableReason)
      ? geo.unavailableReason
      : "unknown"
    return { ...empty, geoUnavailableReason: reason }
  }

  const { latitude, longitude, accuracy } = geo
  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  if (!valid) return { ...empty, geoUnavailableReason: "unavailable" }

  return {
    geoLatitude: latitude,
    geoLongitude: longitude,
    geoAccuracy: Number.isFinite(accuracy as number) ? (accuracy as number) : null,
    geoUnavailableReason: null,
  }
}
