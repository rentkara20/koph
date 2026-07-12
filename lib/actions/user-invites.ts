"use server"

import { z } from "zod"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { accounts, userInvites, users } from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { checkRateLimit } from "@/lib/utils/rate-limit"
import { getSessionWithPermission } from "@/lib/auth/session"

// Invites live 72h by default — same trust model as partner activation and
// task/sign magic links (see [[project-koph-settings]] token TTLs).
const INVITE_TTL_MS = 72 * 60 * 60 * 1000

export type InviteResult = { error?: string }

/**
 * Issues a fresh invite for a user (create or resend). Invalidates any prior
 * un-accepted invite for that user so only the newest link works.
 *
 * This lives in a "use server" module, so it is a directly-callable RPC
 * endpoint — it MUST self-authorize even though its in-app callers
 * (lib/actions/users.ts) already hold a users.manage session. Without this
 * guard, an anonymous caller could mint an invite for any known userId
 * (including an admin) and take the account over via acceptInvite.
 */
export async function issueInvite(userId: string, createdBy: string): Promise<{ token: string }> {
  const session = await getSessionWithPermission("users.manage")
  if (!session) throw new Error("Unauthorized")

  // Expire outstanding un-accepted invites for this user.
  await db
    .update(userInvites)
    .set({ expiresAt: Date.now() })
    .where(and(eq(userInvites.userId, userId), isNull(userInvites.acceptedAt)))

  const token = generateToken()
  await db.insert(userInvites).values({
    id: createId(),
    userId,
    token,
    expiresAt: Date.now() + INVITE_TTL_MS,
    createdBy,
  })
  return { token }
}

export type InviteInfo = {
  valid: boolean
  name: string
  email: string
  isReset: boolean // true if the user already has a credential account (password reset)
}

/** Public: resolve an invite token for the /invite/[token] page. No session. */
export async function getInviteByToken(token: string): Promise<InviteInfo | null> {
  if (!checkRateLimit(`invite:${token}`, 30)) return null

  const [invite] = await db.select().from(userInvites).where(eq(userInvites.token, token))
  if (!invite) return null
  if (invite.acceptedAt || invite.expiresAt < Date.now()) {
    return { valid: false, name: "", email: "", isReset: false }
  }

  const [user] = await db
    .select({ name: users.name, email: users.email, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, invite.userId))
  if (!user || user.disabledAt) return { valid: false, name: "", email: "", isReset: false }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, invite.userId), eq(accounts.providerId, "credential")))

  return { valid: true, name: user.name, email: user.email, isReset: !!account }
}

const acceptSchema = z.object({
  password: z.string().min(10).max(100),
})

/**
 * Public: user sets their own password via the invite link. Creates the
 * credential account (or updates it, for a password-reset invite), verifies
 * the email, and consumes the token. No admin session required — guarded
 * entirely by the unguessable, single-use, time-limited token.
 */
export async function acceptInvite(token: string, password: string): Promise<InviteResult> {
  if (!checkRateLimit(`invite-accept:${token}`, 10)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
  const parsed = acceptSchema.safeParse({ password })
  if (!parsed.success) return { error: "Password must be at least 10 characters" }

  const [invite] = await db.select().from(userInvites).where(eq(userInvites.token, token))
  if (!invite) return { error: "Invalid invite link" }
  if (invite.acceptedAt) return { error: "This invite has already been used" }
  if (invite.expiresAt < Date.now()) return { error: "This invite link has expired" }

  const [user] = await db.select().from(users).where(eq(users.id, invite.userId))
  if (!user) return { error: "Account no longer exists" }
  if (user.disabledAt) return { error: "This account is deactivated" }

  const { hashPassword } = await import("better-auth/crypto")
  const hashed = await hashPassword(parsed.data.password)

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(accounts)
        .set({ password: hashed, updatedAt: Date.now() })
        .where(eq(accounts.id, existing.id))
    } else {
      await tx.insert(accounts).values({
        id: createId(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashed,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
    await tx.update(users).set({ emailVerified: true, updatedAt: Date.now() }).where(eq(users.id, user.id))
    await tx.update(userInvites).set({ acceptedAt: Date.now() }).where(eq(userInvites.id, invite.id))
  })

  return {}
}
