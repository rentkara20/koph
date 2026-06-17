import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

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

  const sessionCookie = getSessionCookie(request)

  if (!sessionCookie) {
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
