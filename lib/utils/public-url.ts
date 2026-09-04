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

// Two resolvers, because there are two different failure modes and they must
// not be conflated:
//
//   DISPATCH  — the link is about to leave the building (an email body, a
//               WhatsApp message). A wrong link here is unrecoverable once
//               sent, so this throws. No link is better than a wrong link.
//
//   DISPLAY   — the link is being rendered into a screen (a "send" button on
//               an admin page, a link shown on the partner's task page).
//               Throwing here would turn one unset env var into a broken
//               daily-operations screen, which is a worse outcome than a
//               visibly disabled button. So this returns null and the caller
//               renders an explicit "link not configured" state.
//
// Outside production both fall back to localhost, so local development and the
// test suite behave normally.

const DEV_FALLBACK = "http://localhost:3000"

/** DISPATCH resolver — throws in production when no origin is configured. */
export function requirePublicBaseUrl(): string {
  const base = appBaseUrl()
  if (base) return base
  if (process.env.NODE_ENV === "production") {
    throw new MissingBaseUrlError(
      "APP_BASE_URL is not set — refusing to send a link with no origin. Set APP_BASE_URL (and BETTER_AUTH_URL) in the deployment environment."
    )
  }
  return DEV_FALLBACK
}

/** DISPLAY resolver — null in production when no origin is configured. */
export function publicBaseUrlOrNull(): string | null {
  const base = appBaseUrl()
  if (base) return base
  return process.env.NODE_ENV === "production" ? null : DEV_FALLBACK
}

function join(base: string, path: string): string {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * Absolute URL for a link that is about to be SENT. Throws in production when
 * no origin is configured — see the DISPATCH note above.
 */
export function publicUrl(path: string): string {
  return join(requirePublicBaseUrl(), path)
}

/**
 * Absolute URL for a link that is only being DISPLAYED. Null when no origin is
 * configured, so the UI can show a disabled control instead of crashing.
 */
export function publicUrlOrNull(path: string): string | null {
  const base = publicBaseUrlOrNull()
  return base ? join(base, path) : null
}
