// Best-effort geolocation for the signing act, client side.
//
// Three hard rules:
//   1. It never blocks a signature. Every failure path — refusal, no fix, no
//      API, timeout — resolves, never rejects, and never throws.
//   2. It is never silent. When there are no coordinates the reason is
//      recorded, so months later a dispute can tell the cases apart.
//   3. It never claims the signer refused unless the signer actually refused.
//      A browser reports "permission denied" both for a person tapping Block
//      and for an environment that killed the request before any prompt could
//      appear — a Permissions-Policy, an insecure origin, an in-app webview.
//      Those are opposite facts in a delivery record, so they are separated
//      here, and where the browser genuinely gives us no way to tell, the
//      reason recorded is `unknown` rather than a guess against the signer.
import type { GeoUnavailableReason, SigningGeo } from "@/lib/domain/signature-channel"

const TIMEOUT_MS = 8000

// A permission decision requires a human to see a dialog and tap it. A denial
// arriving faster than this came from the environment, not from a person.
// Deliberately conservative: a slow, blocked response degrades to `unknown`,
// which is merely uninformative, while too high a value would start recording
// real refusals as blocks.
const HUMAN_DECISION_FLOOR_MS = 250

type PermissionState = "granted" | "denied" | "prompt" | null

// `document.featurePolicy` (Chromium) and `document.permissionsPolicy` (newer)
// answer directly whether the feature is allowed in this document. Neither is
// implemented in Safari, hence the fallbacks below.
type PolicyDocument = Document & {
  featurePolicy?: { allowsFeature?: (feature: string) => boolean }
  permissionsPolicy?: { allowsFeature?: (feature: string) => boolean }
}

function blockedByPolicy(): boolean {
  if (typeof window !== "undefined" && window.isSecureContext === false) return true
  if (typeof document === "undefined") return false
  const doc = document as PolicyDocument
  const policy = doc.permissionsPolicy ?? doc.featurePolicy
  try {
    return policy?.allowsFeature?.("geolocation") === false
  } catch {
    return false
  }
}

async function permissionState(): Promise<PermissionState> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName })
    return status.state
  } catch {
    // Safari/iOS throws for the geolocation descriptor rather than returning.
    return null
  }
}

/**
 * Works out what a reported "permission denied" actually means.
 *
 * The Permissions API is authoritative where it exists: a stored `denied`
 * state is a decision the person made, while `prompt` means no decision was
 * ever recorded — so something else rejected the call. Where the API is absent
 * (Safari, iOS) the only remaining signal is how fast the answer came back.
 */
async function classifyDenial(elapsedMs: number): Promise<GeoUnavailableReason> {
  if (blockedByPolicy()) return "policy_blocked"

  const state = await permissionState()
  if (state === "denied") return "user_denied"
  // Denied while nothing is stored against the origin, or even while the
  // permission reads as granted: the request never reached the person.
  if (state === "prompt" || state === "granted") return "policy_blocked"

  // No Permissions API. A denial too fast to have involved a human is a block;
  // one slow enough to have shown a dialog is a refusal. Anything in between
  // stays unattributed rather than being pinned on the signer.
  if (elapsedMs < HUMAN_DECISION_FLOOR_MS) return "policy_blocked"
  return "user_denied"
}

export function captureSigningGeo(): Promise<SigningGeo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ unavailableReason: "unsupported" })
  }

  return new Promise<SigningGeo>((resolve) => {
    // Guard against a browser that neither resolves nor errors (seen on some
    // in-app webviews): resolve ourselves so the signature can proceed.
    let settled = false
    const startedAt = Date.now()
    const finish = (value: SigningGeo) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const guard = setTimeout(() => finish({ unavailableReason: "timeout" }), TIMEOUT_MS + 2000)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(guard)
        finish({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        })
      },
      (error) => {
        clearTimeout(guard)
        const elapsed = Date.now() - startedAt
        if (error?.code === 1) {
          // Classification is async; the guard is already cleared, and a
          // failure inside it still resolves.
          classifyDenial(elapsed).then(
            (reason) => finish({ unavailableReason: reason }),
            () => finish({ unavailableReason: "unknown" })
          )
          return
        }
        finish({ unavailableReason: mapError(error) })
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 60_000 }
    )
  })
}

function mapError(error: GeolocationPositionError): GeoUnavailableReason {
  switch (error?.code) {
    case 2:
      return "unavailable"
    case 3:
      return "timeout"
    default:
      return "unknown"
  }
}
