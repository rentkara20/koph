"use server"

import { z } from "zod"
import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { partners, partnerContracts, requestTypes, users, accounts } from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import { auth } from "@/lib/auth/config"

const ACTIVATION_TOKEN_TTL_MS = 3 * 24 * 60 * 60 * 1000 // 72 hours

export type ActionResult = { error?: string; id?: string }

// ─── Partners ────────────────────────────────────────────────────────────────

export async function createPartner(formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const id = createId()
  await db.insert(partners).values({
    id,
    name,
    contactPerson: (formData.get("contactPerson") as string) || null,
    mobile: (formData.get("mobile") as string) || null,
    email: (formData.get("email") as string) || null,
    city: (formData.get("city") as string) || null,
    status: (formData.get("status") as "active" | "inactive") || "active",
    notes: (formData.get("notes") as string) || null,
  })

  revalidatePath("/admin/partners")
  return { id }
}

export async function updatePartner(id: string, formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  await db
    .update(partners)
    .set({
      name,
      contactPerson: (formData.get("contactPerson") as string) || null,
      mobile: (formData.get("mobile") as string) || null,
      email: (formData.get("email") as string) || null,
      city: (formData.get("city") as string) || null,
      status: (formData.get("status") as "active" | "inactive") || "active",
      notes: (formData.get("notes") as string) || null,
      updatedAt: Date.now(),
    })
    .where(eq(partners.id, id))

  revalidatePath("/admin/partners")
  revalidatePath(`/admin/partners/${id}`)
  return { id }
}

export async function getPartners() {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select()
    .from(partners)
    .where(isNull(partners.deletedAt))
    .orderBy(asc(partners.name))
    .limit(200)
}

export async function getPartner(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [partner] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.id, id), isNull(partners.deletedAt)))

  if (!partner) return null

  const contracts = await db
    .select({
      id: partnerContracts.id,
      name: partnerContracts.name,
      pricingModel: partnerContracts.pricingModel,
      unitPrice: partnerContracts.unitPrice,
      status: partnerContracts.status,
      startDate: partnerContracts.startDate,
      endDate: partnerContracts.endDate,
      serviceTypeId: partnerContracts.serviceTypeId,
      serviceTypeName: requestTypes.nameEn,
      createdAt: partnerContracts.createdAt,
    })
    .from(partnerContracts)
    .leftJoin(requestTypes, eq(partnerContracts.serviceTypeId, requestTypes.id))
    .where(eq(partnerContracts.partnerId, id))
    .orderBy(desc(partnerContracts.createdAt))

  let linkedEmail: string | null = null
  if (partner.userId) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, partner.userId))
    linkedEmail = u?.email ?? null
  }

  return { partner, contracts, linkedEmail }
}

// ─── Contracts ───────────────────────────────────────────────────────────────

export async function addContract(
  partnerId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Contract name is required" }

  const unitPriceRaw = parseFloat(formData.get("unitPrice") as string)
  if (isNaN(unitPriceRaw) || unitPriceRaw < 0) return { error: "Invalid unit price" }

  const id = createId()
  await db.insert(partnerContracts).values({
    id,
    partnerId,
    name,
    serviceTypeId: (formData.get("serviceTypeId") as string) || null,
    pricingModel: (formData.get("pricingModel") as typeof partnerContracts.$inferInsert["pricingModel"]) ?? "per_order",
    unitPrice: unitPriceRaw,
    startDate: (formData.get("startDate") as string)
      ? new Date(formData.get("startDate") as string).getTime()
      : null,
    endDate: (formData.get("endDate") as string)
      ? new Date(formData.get("endDate") as string).getTime()
      : null,
    status: "active",
  })

  revalidatePath(`/admin/partners/${partnerId}`)
  return { id }
}

export async function updateContractStatus(
  contractId: string,
  partnerId: string,
  status: "active" | "expired" | "cancelled"
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db
    .update(partnerContracts)
    .set({ status, updatedAt: Date.now() })
    .where(eq(partnerContracts.id, contractId))

  revalidatePath(`/admin/partners/${partnerId}`)
  return { id: contractId }
}

export async function deletePartner(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db.update(partners).set({ deletedAt: Date.now() }).where(eq(partners.id, id))

  revalidatePath("/admin/partners")
  return {}
}

// ─── Partner portal login ─────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(100),
})

/**
 * Creates a portal login for a partner: a user account with role "partner"
 * linked via partners.userId. The partner then signs in at /login and lands
 * on /partner (scoped reads only — see lib/actions/partner-portal.ts).
 */
export async function createPartnerLogin(
  partnerId: string,
  email: string,
  password: string
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) return { error: "Invalid email or password" }

  const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId))
  if (!partner) return { error: "Partner not found" }
  if (partner.userId) return { error: "Partner already has a login" }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email))
  if (existing) return { error: "A user with this email already exists" }

  try {
    await auth.api.signUpEmail({
      body: { email: parsed.data.email, password: parsed.data.password, name: partner.name },
    })
  } catch (error) {
    console.error("createPartnerLogin signup failed", error)
    return { error: "Could not create the login account" }
  }

  const [created] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email))
  if (!created) return { error: "Could not create the login account" }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ role: "partner", emailVerified: true })
      .where(eq(users.id, created.id))
    await tx
      .update(partners)
      .set({ userId: created.id, updatedAt: Date.now() })
      .where(eq(partners.id, partnerId))
  })

  revalidatePath(`/admin/partners/${partnerId}`)
  return { id: created.id }
}

// ─── Self-service activation link ──────────────────────────────────────────

/**
 * Admin-triggered: generates a one-time link the partner opens to set their
 * own email + password. Avoids the admin typing (and mistyping) the
 * partner's email, and the password never has to travel over chat.
 */
export async function generatePartnerActivationLink(partnerId: string): Promise<ActionResult & { link?: string }> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [partner] = await db.select({ id: partners.id, userId: partners.userId }).from(partners).where(eq(partners.id, partnerId))
  if (!partner) return { error: "Partner not found" }

  const activationToken = generateToken()
  const activationTokenExpiresAt = Date.now() + ACTIVATION_TOKEN_TTL_MS

  await db
    .update(partners)
    .set({ activationToken, activationTokenExpiresAt, updatedAt: Date.now() })
    .where(eq(partners.id, partnerId))

  revalidatePath(`/admin/partners/${partnerId}`)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return { id: partnerId, link: `${baseUrl}/activate/${activationToken}` }
}

export async function getPartnerByActivationToken(token: string) {
  const [partner] = await db
    .select({
      id: partners.id,
      name: partners.name,
      email: partners.email,
      userId: partners.userId,
      activationTokenExpiresAt: partners.activationTokenExpiresAt,
    })
    .from(partners)
    .where(eq(partners.activationToken, token))

  if (!partner) return null
  if (!partner.activationTokenExpiresAt || partner.activationTokenExpiresAt < Date.now()) return null
  return partner
}

const activateSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(100),
})

/**
 * Public action — no admin session. Guarded entirely by the (unguessable,
 * time-limited, single-use) token, same trust model as /task/[token] and /sign/[token].
 */
export async function activatePartnerAccount(
  token: string,
  email: string,
  password: string
): Promise<ActionResult> {
  const parsed = activateSchema.safeParse({ email, password })
  if (!parsed.success) return { error: "Invalid email or password" }

  const partner = await getPartnerByActivationToken(token)
  if (!partner) return { error: "Link expired or invalid" }
  if (partner.userId) return { error: "Partner already has a login" }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email))
  if (existing) return { error: "A user with this email already exists" }

  try {
    await auth.api.signUpEmail({
      body: { email: parsed.data.email, password: parsed.data.password, name: partner.name },
    })
  } catch (error) {
    console.error("activatePartnerAccount signup failed", error)
    return { error: "Could not create the login account" }
  }

  const [created] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email))
  if (!created) return { error: "Could not create the login account" }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ role: "partner", emailVerified: true }).where(eq(users.id, created.id))
    await tx
      .update(partners)
      .set({ userId: created.id, activationToken: null, activationTokenExpiresAt: null, updatedAt: Date.now() })
      .where(eq(partners.id, partner.id))
  })

  return { id: partner.id }
}

// ─── Admin-triggered password reset ────────────────────────────────────────

const resetPasswordSchema = z.object({
  password: z.string().min(1).max(100),
})

/**
 * Lets an admin set a new password for a partner who already has a linked
 * login (e.g. they forgot it). Hashes with better-auth's own hasher and
 * writes directly to the credential account row — no need for the old password.
 */
export async function resetPartnerPassword(partnerId: string, password: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = resetPasswordSchema.safeParse({ password })
  if (!parsed.success) return { error: "Password is required" }

  const [partner] = await db.select({ userId: partners.userId }).from(partners).where(eq(partners.id, partnerId))
  if (!partner?.userId) return { error: "Partner has no login" }

  const { hashPassword } = await import("better-auth/crypto")
  const hashed = await hashPassword(parsed.data.password)

  const result = await db
    .update(accounts)
    .set({ password: hashed, updatedAt: Date.now() })
    .where(and(eq(accounts.userId, partner.userId), eq(accounts.providerId, "credential")))

  if (result.rowsAffected === 0) return { error: "Partner has no login" }

  return { id: partnerId }
}
