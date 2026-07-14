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

export function appBaseUrl(): string {
  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ""
  return base.replace(/\/+$/, "")
}

/** Builds an absolute customer-facing URL from a path (e.g. `/sign/<token>`). */
export function publicUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  return `${appBaseUrl()}${p}`
}
