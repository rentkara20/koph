// The two resolvers exist because a missing origin has two different correct
// answers depending on whether the link is about to be SENT or merely SHOWN.
// Conflating them is what made the first version of this guard wrong: it would
// have turned one unset env var into a broken daily-operations screen.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  MissingBaseUrlError,
  appBaseUrl,
  publicBaseUrlOrNull,
  publicUrl,
  publicUrlOrNull,
  requirePublicBaseUrl,
} from "./public-url"

const saved = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
}

function setEnv(env: { app?: string; publicApp?: string; nodeEnv?: string }) {
  if (env.app === undefined) delete process.env.APP_BASE_URL
  else process.env.APP_BASE_URL = env.app
  if (env.publicApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = env.publicApp
  // process.env.NODE_ENV is not writable under Node 26; vi.stubEnv is.
  vi.stubEnv("NODE_ENV", (env.nodeEnv ?? "test") as "test" | "production" | "development")
}

beforeEach(() => setEnv({}))
afterEach(() => {
  vi.unstubAllEnvs()
  setEnv({ app: saved.APP_BASE_URL, publicApp: saved.NEXT_PUBLIC_APP_URL, nodeEnv: saved.NODE_ENV })
})

describe("appBaseUrl", () => {
  test("prefers APP_BASE_URL and strips trailing slashes", () => {
    setEnv({ app: "https://karaops.com///", publicApp: "https://wrong.example" })
    expect(appBaseUrl()).toBe("https://karaops.com")
  })

  test("falls back to NEXT_PUBLIC_APP_URL — the value production actually has today", () => {
    setEnv({ publicApp: "https://karaops.com" })
    expect(appBaseUrl()).toBe("https://karaops.com")
  })
})

describe("requirePublicBaseUrl — DISPATCH", () => {
  test("throws in production when nothing is configured: no link beats a wrong link", () => {
    setEnv({ nodeEnv: "production" })
    expect(() => requirePublicBaseUrl()).toThrow(MissingBaseUrlError)
    expect(() => publicUrl("/sign/tok")).toThrow(MissingBaseUrlError)
  })

  test("does NOT throw in production when only NEXT_PUBLIC_APP_URL is set", () => {
    // Guards against a false alarm: production has NEXT_PUBLIC_APP_URL but no
    // APP_BASE_URL, so this path must stay quiet there.
    setEnv({ publicApp: "https://karaops.com", nodeEnv: "production" })
    expect(publicUrl("/sign/tok")).toBe("https://karaops.com/sign/tok")
  })

  test("falls back to localhost outside production", () => {
    setEnv({ nodeEnv: "development" })
    expect(publicUrl("/sign/tok")).toBe("http://localhost:3000/sign/tok")
  })

  test("normalises a path with no leading slash", () => {
    setEnv({ app: "https://karaops.com" })
    expect(publicUrl("sign/tok")).toBe("https://karaops.com/sign/tok")
  })
})

describe("publicUrlOrNull — DISPLAY", () => {
  test("null in production instead of throwing, so a screen degrades rather than breaks", () => {
    setEnv({ nodeEnv: "production" })
    expect(publicBaseUrlOrNull()).toBeNull()
    expect(publicUrlOrNull("/sign/tok")).toBeNull()
  })

  test("returns the link when configured", () => {
    setEnv({ app: "https://karaops.com", nodeEnv: "production" })
    expect(publicUrlOrNull("/sign/tok")).toBe("https://karaops.com/sign/tok")
  })

  test("falls back to localhost outside production", () => {
    setEnv({ nodeEnv: "test" })
    expect(publicUrlOrNull("/task/tok")).toBe("http://localhost:3000/task/tok")
  })
})
