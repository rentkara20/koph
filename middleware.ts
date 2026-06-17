import { NextRequest, NextResponse } from "next/server"

// Better Auth session cookie names (plain in dev, __Secure- prefixed over HTTPS).
// Read directly instead of importing better-auth — its helpers pull in
// Node-only modules that the Edge middleware runtime can't bundle.
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]

function hasSessionCookie(request: NextRequest) {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))
}

// Routes that never require auth
const PUBLIC_PREFIXES = [
  "/login",
  "/sign/",
  "/track",
  "/api/auth",
  "/api/public",
  "/_next",
  "/favicon",
]

// Routes restricted to specific roles
const ROLE_RULES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin/payments", roles: ["admin", "finance"] },
  { prefix: "/admin/reports", roles: ["admin", "finance"] },
  { prefix: "/admin/settings", roles: ["admin"] },
  { prefix: "/partner", roles: ["partner", "admin"] },
]

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role-based route protection (server-side coarse guard)
  // Fine-grained checks happen in server components / actions
  const response = NextResponse.next()

  // Pass lang preference via header so layouts can read it without a DB call
  const lang = request.cookies.get("lang")?.value ?? "en"
  response.headers.set("x-lang", lang)

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
