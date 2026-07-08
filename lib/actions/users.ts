"use server"

import { z } from "zod"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { accounts, partners, sessions, userInvites, users } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithPermission } from "@/lib/auth/session"
import { ROLES, type Role } from "@/lib/auth/permissions"
import { issueInvite } from "@/lib/actions/user-invites"

export type UserActionResult = { error?: string; id?: string; inviteToken?: string }

export type UserListItem = {
  id: string
  name: string
  email: string
  role: Role
  isDisabled: boolean
  hasLogin: boolean
  hasPendingInvite: boolean
  lastLoginAt: number | null
  createdAt: number
  partnerName: string | null
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listUsers(filters?: {
  role?: string
  status?: "active" | "disabled" | "pending"
  search?: string
}): Promise<UserListItem[]> {
  const session = await getSessionWithPermission("users.read")
  if (!session) return []

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
      partnerName: partners.name,
      // Last login approximated from the newest session row for the user.
      // No dedicated column; sessions expire/prune so this can read null even
      // for users who have logged in before.
      lastLoginAt: sql<number | null>`(SELECT MAX(${sessions.createdAt}) FROM ${sessions} WHERE ${sessions.userId} = ${users.id})`,
      hasLogin: sql<number>`(SELECT COUNT(*) FROM ${accounts} WHERE ${accounts.userId} = ${users.id} AND ${accounts.providerId} = 'credential')`,
      hasPendingInvite: sql<number>`(SELECT COUNT(*) FROM ${userInvites} WHERE ${userInvites.userId} = ${users.id} AND ${userInvites.acceptedAt} IS NULL AND ${userInvites.expiresAt} > ${Date.now()})`,
    })
    .from(users)
    .leftJoin(partners, eq(partners.userId, users.id))
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))

  const search = filters?.search?.trim().toLowerCase()

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as Role,
      isDisabled: !!r.disabledAt,
      hasLogin: Number(r.hasLogin) > 0,
      hasPendingInvite: Number(r.hasPendingInvite) > 0,
      lastLoginAt: r.lastLoginAt ?? null,
      createdAt: r.createdAt,
      partnerName: r.partnerName ?? null,
    }))
    .filter((u) => {
      if (filters?.role && u.role !== filters.role) return false
      if (filters?.status === "active" && (u.isDisabled || !u.hasLogin)) return false
      if (filters?.status === "disabled" && !u.isDisabled) return false
      if (filters?.status === "pending" && (u.hasLogin || u.isDisabled)) return false
      if (search && !u.name.toLowerCase().includes(search) && !u.email.toLowerCase().includes(search)) return false
      return true
    })
}

/** Partners without a linked login — for the "create partner user" picker. */
export async function getUnlinkedPartners() {
  const session = await getSessionWithPermission("users.manage")
  if (!session) return []
  return db
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(and(isNull(partners.userId), isNull(partners.deletedAt)))
    .orderBy(partners.name)
}

// ─── Create (invite-based, no password set by admin) ────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  role: z.enum(["admin", "finance", "viewer", "partner"]),
  partnerId: z.string().optional(),
})

export async function createUser(input: {
  name: string
  email: string
  role: string
  partnerId?: string
}): Promise<UserActionResult> {
  const session = await getSessionWithPermission("users.manage")
  if (!session) return { error: "Unauthorized" }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { error: "Please provide a valid name, email, and role" }
  const { name, email, role, partnerId } = parsed.data

  // A partner user must link to an existing partner record, otherwise the
  // partner portal (which reads via partners.userId) would be broken for them.
  if (role === "partner" && !partnerId) {
    return { error: "Select the partner company this login belongs to" }
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (existing) return { error: "A user with this email already exists" }

  const userId = createId()
  let inviteToken = ""

  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: userId, name, email, role, emailVerified: false })

      if (role === "partner" && partnerId) {
        const [partner] = await tx
          .select({ id: partners.id, userId: partners.userId })
          .from(partners)
          .where(and(eq(partners.id, partnerId), isNull(partners.deletedAt)))
        if (!partner) throw new Error("PARTNER_NOT_FOUND")
        if (partner.userId) throw new Error("PARTNER_ALREADY_LINKED")
        await tx.update(partners).set({ userId, updatedAt: Date.now() }).where(eq(partners.id, partnerId))
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === "PARTNER_NOT_FOUND") return { error: "Partner not found" }
    if (error instanceof Error && error.message === "PARTNER_ALREADY_LINKED") return { error: "That partner already has a login" }
    throw error
  }

  const { token } = await issueInvite(userId, session.user.id)
  inviteToken = token

  revalidatePath("/admin/users")
  return { id: userId, inviteToken }
}

// ─── Invite / password-reset link ───────────────────────────────────────────

/** Resend (or first-issue) an invite link. Also serves as "reset password" —
 *  the user re-sets their password through the same flow. */
export async function resendInvite(userId: string): Promise<UserActionResult> {
  const session = await getSessionWithPermission("users.manage")
  if (!session) return { error: "Unauthorized" }

  const [user] = await db
    .select({ id: users.id, disabledAt: users.disabledAt })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
  if (!user) return { error: "User not found" }
  if (user.disabledAt) return { error: "Reactivate the account before sending an invite" }

  const { token } = await issueInvite(userId, session.user.id)
  revalidatePath("/admin/users")
  return { id: userId, inviteToken: token }
}

// ─── Role ─────────────────────────────────────────────────────────────────

export async function setUserRole(userId: string, role: string): Promise<UserActionResult> {
  const session = await getSessionWithPermission("users.manage")
  if (!session) return { error: "Unauthorized" }
  if (!ROLES.includes(role as Role)) return { error: "Invalid role" }

  if (userId === session.user.id && role !== "admin") {
    return { error: "You cannot change your own admin role" }
  }

  const [target] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)))
  if (!target) return { error: "User not found" }

  // Never leave the system without an active admin.
  if (target.role === "admin" && role !== "admin" && (await countActiveAdmins()) <= 1) {
    return { error: "This is the last active admin — assign another admin first" }
  }
  // Moving a partner user to a staff role (or vice-versa) is a footgun given
  // partners.userId linkage; block it for now.
  if ((target.role === "partner") !== (role === "partner")) {
    return { error: "Cannot switch between partner and staff roles — create a separate account" }
  }

  await db.update(users).set({ role: role as Role, updatedAt: Date.now() }).where(eq(users.id, userId))
  revalidatePath("/admin/users")
  return { id: userId }
}

// ─── Activate / deactivate ──────────────────────────────────────────────────

export async function setUserActive(userId: string, active: boolean): Promise<UserActionResult> {
  const session = await getSessionWithPermission("users.manage")
  if (!session) return { error: "Unauthorized" }

  if (userId === session.user.id && !active) {
    return { error: "You cannot deactivate your own account" }
  }

  const [target] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)))
  if (!target) return { error: "User not found" }

  if (!active && target.role === "admin" && (await countActiveAdmins()) <= 1) {
    return { error: "This is the last active admin — cannot deactivate" }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ disabledAt: active ? null : Date.now(), updatedAt: Date.now() })
      .where(eq(users.id, userId))
    // Deactivating kills existing sessions so access ends promptly (the
    // getSession disabled-check also blocks, with at most the cookie-cache lag).
    if (!active) await tx.delete(sessions).where(eq(sessions.userId, userId))
  })

  revalidatePath("/admin/users")
  return { id: userId }
}

// ─── Session revocation ─────────────────────────────────────────────────────

export async function revokeUserSessions(userId: string): Promise<UserActionResult> {
  const session = await getSessionWithPermission("users.manage")
  if (!session) return { error: "Unauthorized" }

  await db.delete(sessions).where(eq(sessions.userId, userId))
  revalidatePath("/admin/users")
  return { id: userId }
}

// ─── Delete (soft) ──────────────────────────────────────────────────────────

export async function deleteUser(userId: string): Promise<UserActionResult> {
  const session = await getSessionWithPermission("users.manage")
  if (!session) return { error: "Unauthorized" }
  if (userId === session.user.id) return { error: "You cannot delete your own account" }

  const [target] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)))
  if (!target) return { error: "User not found" }
  if (target.role === "admin" && (await countActiveAdmins()) <= 1) {
    return { error: "This is the last active admin — cannot delete" }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ deletedAt: Date.now(), disabledAt: Date.now(), updatedAt: Date.now() })
      .where(eq(users.id, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
    // If this was a partner login, unlink so the partner record can be re-invited.
    await tx.update(partners).set({ userId: null, updatedAt: Date.now() }).where(eq(partners.userId, userId))
  })

  revalidatePath("/admin/users")
  return { id: userId }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function countActiveAdmins(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.deletedAt), isNull(users.disabledAt)))
  return Number(row?.n ?? 0)
}
