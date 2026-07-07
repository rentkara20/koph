"use server"

import { ne, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { sessions } from "@/lib/db/schema"
import { getSessionWithRole } from "@/lib/auth/session"

export type SessionSecurityResult = { error?: string; revoked?: number }

export async function getActiveSessionCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(sessions)
  return row?.value ?? 0
}

/**
 * Revokes every session except the caller's own — an incident-response tool
 * (compromised account, mass logout before a policy change) rather than a
 * routine setting. Session length/idle-timeout themselves stay code-defined
 * (lib/auth/config.ts) since better-auth builds its config once at process
 * start; making them DB-driven would need a bigger auth-init refactor.
 */
export async function revokeAllOtherSessions(): Promise<SessionSecurityResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const result = await db.delete(sessions).where(ne(sessions.id, session.session.id))
  return { revoked: (result as { rowsAffected?: number }).rowsAffected ?? 0 }
}
