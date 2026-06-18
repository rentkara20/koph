"use server"

import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { partners, partnerContracts, requestTypes } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSession } from "@/lib/auth/session"

export type ActionResult = { error?: string; id?: string }

// ─── Partners ────────────────────────────────────────────────────────────────

export async function createPartner(formData: FormData): Promise<ActionResult> {
  const session = await getSession()
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
  const session = await getSession()
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
  const session = await getSession()
  if (!session) return []

  return db
    .select()
    .from(partners)
    .where(isNull(partners.deletedAt))
    .orderBy(asc(partners.name))
    .limit(200)
}

export async function getPartner(id: string) {
  const session = await getSession()
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

  return { partner, contracts }
}

// ─── Contracts ───────────────────────────────────────────────────────────────

export async function addContract(
  partnerId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession()
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
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db
    .update(partnerContracts)
    .set({ status, updatedAt: Date.now() })
    .where(eq(partnerContracts.id, contractId))

  revalidatePath(`/admin/partners/${partnerId}`)
  return { id: contractId }
}

export async function deletePartner(id: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db.update(partners).set({ deletedAt: Date.now() }).where(eq(partners.id, id))

  revalidatePath("/admin/partners")
  return {}
}
