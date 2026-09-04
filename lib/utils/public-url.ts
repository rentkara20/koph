// Single source of truth for customer-facing absolute URLs (signature, secure
// document, verification, print links).
//
// Server code resolves the runtime `APP_BASE_URL` first: swapping the domain
// later (e.g. the current Vercel URL → https://sign.rentkara.app) is then a
// configuration + redeploy change only, with no workflow or code rewrite.
//
// `NEXT_PUBLIC_APP_URL` remains the fallback so links built inside client
// components (where a non-public env var is not available) keep working. Prefer
// building links on the server and passing them down; use the client fallback
// only where a client component genuinely constructs a link itself.
//
// Why this file refuses to degrade quietly: a signing link is the moment a
// customer decides whether this company looks real. A link that goes out
// pointing at `localhost:3000`, at a raw deployment hostname, or at nothing at
// all is a trust failure, not a cosmetic bug — and it is unrecoverable once it
// has been sent. So an unconfigured base URL fails loudly at the point a
// customer-facing link is built, rather than producing a broken one.

export function appBaseUrl(): string {
  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ""
  return base.replace(/\/+$/, "")
}

export class MissingBaseUrlError extends Error {}

/**
 * The base URL for anything that will reach a customer or partner.
 *
 * In production an empty value throws: no link is strictly better than a wrong
 * link. Outside production it falls back to localhost so local development and
 * the test suite keep working.
 */
export function requirePublicBaseUrl(): string {
  const base = appBaseUrl()
  if (base) return base
  if (process.env.NODE_ENV === "production") {
    throw new MissingBaseUrlError(
      "APP_BASE_URL is not set — refusing to build a customer-facing link with no origin. Set APP_BASE_URL (and BETTER_AUTH_URL) in the deployment environment."
    )
  }
  return "http://localhost:3000"
}

/** Builds an absolute customer-facing URL from a path (e.g. `/sign/<token>`). */
export function publicUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  return `${requirePublicBaseUrl()}${p}`
}
