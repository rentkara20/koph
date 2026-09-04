import { describe, expect, test } from "vitest"
import { assertSafeSeedTarget, checkSeedTarget } from "./seed-target-guard"

const PROD_LIKE = [
  // The real production URL is not visible from this machine, so the guard
  // cannot rely on knowing its name. These are all the shapes it might have.
  "libsql://koph-rentkara20.turso.io",
  "libsql://koph.turso.io",
  "libsql://koph-prod-rentkara20.turso.io",
  "libsql://operations-rentkara20.turso.io",
]

describe("checkSeedTarget", () => {
  test("refuses a remote database that does not identify itself as non-production", () => {
    for (const url of PROD_LIKE) {
      const verdict = checkSeedTarget(url)
      expect(verdict.ok, `should refuse ${url}`).toBe(false)
    }
  })

  test("refuses anything containing 'prod' even when a safe marker is also present", () => {
    // The trap a name-blocklist walks into.
    expect(checkSeedTarget("libsql://koph-prod-preview.turso.io").ok).toBe(false)
    expect(checkSeedTarget("libsql://koph-preview-production.turso.io").ok).toBe(false)
  })

  test("allows a remote database that names itself preview/staging/qa/test", () => {
    expect(checkSeedTarget("libsql://koph-preview-rentkara20.turso.io").ok).toBe(true)
    expect(checkSeedTarget("libsql://koph-staging.turso.io").ok).toBe(true)
    expect(checkSeedTarget("libsql://koph-qa.turso.io").ok).toBe(true)
  })

  test("allows a local file — production is Turso-hosted, a file is only on this machine", () => {
    expect(checkSeedTarget("file:local-preview.db").ok).toBe(true)
    expect(checkSeedTarget("file:local.db").ok).toBe(true)
  })

  test("refuses an empty or missing URL rather than defaulting to something", () => {
    expect(checkSeedTarget(undefined).ok).toBe(false)
    expect(checkSeedTarget(null).ok).toBe(false)
    expect(checkSeedTarget("   ").ok).toBe(false)
  })

  test("is case-insensitive", () => {
    expect(checkSeedTarget("libsql://KOPH-PROD.turso.io").ok).toBe(false)
    expect(checkSeedTarget("libsql://KOPH-PREVIEW.turso.io").ok).toBe(true)
  })

  test("assertSafeSeedTarget throws on a refusal and is quiet on a pass", () => {
    expect(() => assertSafeSeedTarget("libsql://koph.turso.io")).toThrow(/Refusing to seed/)
    expect(() => assertSafeSeedTarget("file:local-preview.db")).not.toThrow()
  })
})
