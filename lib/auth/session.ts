import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "./config"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { roleCan, type Permission, type Role } from "./permissions"

/**
 * Returns the current session, or null. A DISABLED user is treated as logged
 * out here — this is the authoritative deactivation gate. It covers both new
 * and existing sessions (a revoke on deactivate handles the rest), with at
 * most a ~5min lag for the cookie-cached path (see auth config cookieCache).
 */
export async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const [row] = await db
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, session.user.id))
  if (row?.disabledAt) return null

  return session
}

export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")
  return session
}

export type { Role }

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
 * Permission-based guard — preferred over raw role checks for new code.
 * Returns the session only if the user's role grants `permission`. Routes
 * authorization through lib/auth/permissions.ts so future RBAC changes don't
 * touch call sites.
 */
export async function getSessionWithPermission(permission: Permission) {
  const session = await getSession()
  if (!session) return null
  if (!roleCan(session.user.role as Role, permission)) return null
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
