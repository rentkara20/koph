import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./lib/i18n/config.ts")

// Locked down everywhere by default. The signing routes are the one exception:
// a delivery signature records where it was taken, and `geolocation=()` blocks
// the API outright — getCurrentPosition then fails with PERMISSION_DENIED
// without ever prompting, which reads in the database exactly like a person
// refusing. `self` still excludes every cross-origin frame, and the signing
// pages are same-origin.
const PERMISSIONS_POLICY_DEFAULT = "camera=(), microphone=(), geolocation=()"
const PERMISSIONS_POLICY_SIGNING = "camera=(), microphone=(), geolocation=(self)"

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: PERMISSIONS_POLICY_DEFAULT,
  },
  {
    // Defense-in-depth for token pages rendering third-party data.
    // 'unsafe-inline' script-src is required by Next.js hydration without a
    // nonce pipeline; frame-ancestors 'none' mirrors X-Frame-Options.
    // 'unsafe-eval' dropped — not required for Next.js production hydration.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
      "font-src 'self' data:",
      // Photo upload goes browser -> Vercel Blob directly, so BOTH the API that
      // issues the upload token (vercel.com/api/blob) and the storage host that
      // receives the bytes must be reachable. Allowing only the public read
      // host silently blocked every upload: the request never left the page.
      "connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  async headers() {
    // Ordered most-specific first, and the general rule explicitly excludes the
    // signing paths rather than relying on override precedence between two
    // matching rules that set the same header.
    return [
      {
        source: "/:prefix(task|sign)/:path*",
        headers: SECURITY_HEADERS.map((header) =>
          header.key === "Permissions-Policy"
            ? { key: header.key, value: PERMISSIONS_POLICY_SIGNING }
            : header
        ),
      },
      { source: "/((?!task/|sign/).*)", headers: SECURITY_HEADERS },
    ]
  },
}

export default withNextIntl(nextConfig)
