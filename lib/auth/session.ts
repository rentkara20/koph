import { headers } from "next/headers"
import { auth } from "./config"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")
  return session
}

export type Role = "admin" | "finance" | "viewer" | "partner"

/**
 * Session guard for server actions: returns the session only when the user
 * holds one of the given roles, otherwise null. Actions should translate a
 * null result into their error envelope instead of throwing.
 */
export async function getSessionWithRole(...roles: Role[]) {
  const session = await getSession()
  if (!session) return null
  if (!roles.includes(session.user.role as Role)) return null
  return session
}

/**
 * Session guard for internal staff reads (admin dashboard data). Excludes the
 * `partner` role so partner accounts cannot enumerate customers, requests,
 * signatures, or payments beyond their own token-scoped task pages.
 */
export async function getStaffSession() {
  return getSessionWithRole("admin", "finance", "viewer")
}

export async function requireRole(
  ...roles: Array<"admin" | "finance" | "viewer" | "partner">
) {
  const session = await requireSession()
  if (!roles.includes(session.user.role as never)) {
    throw new Error("Forbidden")
  }
  return session
}
