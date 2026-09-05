import { describe, test, expect, vi, afterEach } from "vitest"
import { captureSigningGeo } from "./signing-geo"

type ErrorCallback = (error: { code: number }) => void

/**
 * Stubs just enough of a browser to drive one capture.
 *
 * `permissions` null means the Permissions API is missing entirely, which is
 * the Safari/iOS case and the one where the timing fallback decides.
 */
function stubBrowser(opts: {
  onGetPosition: (success: PositionCallback, failure: ErrorCallback) => void
  permissions?: "granted" | "denied" | "prompt" | null
  isSecureContext?: boolean
  policyAllows?: boolean | undefined
}) {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (success: PositionCallback, failure: ErrorCallback) =>
        opts.onGetPosition(success, failure),
    },
    permissions:
      opts.permissions == null
        ? undefined
        : { query: async () => ({ state: opts.permissions }) },
  })
  vi.stubGlobal("window", { isSecureContext: opts.isSecureContext ?? true })
  vi.stubGlobal("document", {
    permissionsPolicy:
      opts.policyAllows === undefined
        ? undefined
        : { allowsFeature: () => opts.policyAllows },
  })
}

const denyNow: (s: PositionCallback, f: ErrorCallback) => void = (_s, f) => f({ code: 1 })

afterEach(() => vi.unstubAllGlobals())

describe("captureSigningGeo", () => {
  test("records coordinates when the device provides a fix", async () => {
    stubBrowser({
      onGetPosition: (success) =>
        success({ coords: { latitude: 24.7, longitude: 46.6, accuracy: 12 } } as GeolocationPosition),
    })
    expect(await captureSigningGeo()).toEqual({ latitude: 24.7, longitude: 46.6, accuracy: 12 })
  })

  // The distinction the whole module exists for.
  test("a stored denial is the signer's own refusal", async () => {
    stubBrowser({ onGetPosition: denyNow, permissions: "denied" })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "user_denied" })
  })

  test("a denial with nothing stored against the origin is an environment block", async () => {
    stubBrowser({ onGetPosition: denyNow, permissions: "prompt" })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "policy_blocked" })
  })

  test("a denial while the permission reads as granted is an environment block", async () => {
    stubBrowser({ onGetPosition: denyNow, permissions: "granted" })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "policy_blocked" })
  })

  // The exact bug this replaced: Permissions-Policy killed the request and the
  // record claimed the customer had refused.
  test("a policy that disallows the feature is never recorded as a refusal", async () => {
    stubBrowser({ onGetPosition: denyNow, permissions: "denied", policyAllows: false })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "policy_blocked" })
  })

  test("an insecure origin is an environment block, not a refusal", async () => {
    stubBrowser({ onGetPosition: denyNow, permissions: "denied", isSecureContext: false })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "policy_blocked" })
  })

  test("without a Permissions API, an instant denial is an environment block", async () => {
    stubBrowser({ onGetPosition: denyNow, permissions: null })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "policy_blocked" })
  })

  // Observed on iOS 26 / Chrome: system location permission off, no prompt
  // shown, and the denial still took longer than the floor. Slowness alone must
  // never be read as the signer having refused.
  test("without a Permissions API, a slow denial stays unattributed", async () => {
    stubBrowser({
      onGetPosition: (_s, f) => setTimeout(() => f({ code: 1 }), 320),
      permissions: null,
    })
    const result = await captureSigningGeo()
    expect(result).toEqual({ unavailableReason: "unknown" })
    expect(result).not.toEqual({ unavailableReason: "user_denied" })
  })

  test("no geolocation API at all is 'unsupported'", async () => {
    vi.stubGlobal("navigator", {})
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "unsupported" })
  })

  test("maps the non-permission failures without touching the refusal path", async () => {
    stubBrowser({ onGetPosition: (_s, f) => f({ code: 2 }) })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "unavailable" })
    vi.unstubAllGlobals()
    stubBrowser({ onGetPosition: (_s, f) => f({ code: 3 }) })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "timeout" })
    vi.unstubAllGlobals()
    stubBrowser({ onGetPosition: (_s, f) => f({ code: 99 }) })
    expect(await captureSigningGeo()).toEqual({ unavailableReason: "unknown" })
  })
})
