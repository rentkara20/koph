"use server"

import { and, desc, eq, isNull, like, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { suppliers } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import { createSupplierSchema, firstError } from "@/lib/validation/schemas"

export type ActionResult = { error?: string; id?: string }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type SupplierCoreInput = {
  name: string
  contactPerson?: string | null
  mobile?: string | null
  email?: string | null
  city?: string | null
  address?: string | null
  notes?: string | null
  pickupContactName?: string | null
  pickupContactMobile?: string | null
  pickupMapsUrl?: string | null
  pickupNotes?: string | null
}

function parseSupplierForm(formData: FormData) {
  return createSupplierSchema.safeParse({
    name: (formData.get("name") as string)?.trim(),
    contactPerson: (formData.get("contactPerson") as string) || undefined,
    mobile: (formData.get("mobile") as string) || undefined,
    email: (formData.get("email") as string) || undefined,
    city: (formData.get("city") as string) || undefined,
    address: (formData.get("address") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    pickupContactName: (formData.get("pickupContactName") as string) || undefined,
    pickupContactMobile: (formData.get("pickupContactMobile") as string) || undefined,
    pickupMapsUrl: (formData.get("pickupMapsUrl") as string) || undefined,
    pickupNotes: (formData.get("pickupNotes") as string) || undefined,
  })
}

// Tx-scoped create, reused by the "use server" wrapper below AND the CSV
// Import/Export Center. Throws on invalid input (mirrors createCustomerCore's
// throw-in-Core / catch-in-wrapper convention).
export async function createSupplierCore(
  tx: Tx,
  input: SupplierCoreInput,
  actorUserId: string | null
): Promise<{ id: string }> {
  const name = input.name?.trim()
  if (!name) throw new Error("Name is required")

  const id = createId()
  await tx.insert(suppliers).values({
    id,
    name,
    contactPerson: input.contactPerson || null,
    mobile: input.mobile || null,
    email: input.email || null,
    city: input.city || null,
    address: input.address || null,
    notes: input.notes || null,
    pickupContactName: input.pickupContactName || null,
    pickupContactMobile: input.pickupContactMobile || null,
    pickupMapsUrl: input.pickupMapsUrl || null,
    pickupNotes: input.pickupNotes || null,
    createdBy: actorUserId,
  })

  return { id }
}

export async function updateSupplierCore(
  tx: Tx,
  id: string,
  input: SupplierCoreInput
): Promise<{ id: string }> {
  const name = input.name?.trim()
  if (!name) throw new Error("Name is required")

  await tx
    .update(suppliers)
    .set({
      name,
      contactPerson: input.contactPerson || null,
      mobile: input.mobile || null,
      email: input.email || null,
      city: input.city || null,
      address: input.address || null,
      notes: input.notes || null,
      pickupContactName: input.pickupContactName || null,
      pickupContactMobile: input.pickupContactMobile || null,
      pickupMapsUrl: input.pickupMapsUrl || null,
      pickupNotes: input.pickupNotes || null,
      updatedAt: Date.now(),
    })
    .where(eq(suppliers.id, id))

  return { id }
}

export async function createSupplier(formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = parseSupplierForm(formData)
  if (!parsed.success) return { error: firstError(parsed.error) }

  let id = ""
  await db.transaction(async (tx) => {
    const result = await createSupplierCore(tx, parsed.data, session.user.id)
    id = result.id
  })

  revalidatePath("/admin/suppliers")
  return { id }
}

export async function updateSupplier(id: string, formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = parseSupplierForm(formData)
  if (!parsed.success) return { error: firstError(parsed.error) }

  await db.transaction(async (tx) => {
    await updateSupplierCore(tx, id, parsed.data)
  })

  revalidatePath("/admin/suppliers")
  revalidatePath(`/admin/suppliers/${id}`)
  return { id }
}

export async function getSuppliers(search?: string) {
  const session = await getStaffSession()
  if (!session) return []

  if (search?.trim()) {
    const q = `%${search.trim()}%`
    return db
      .select()
      .from(suppliers)
      .where(
        and(
          isNull(suppliers.deletedAt),
          or(like(suppliers.name, q), like(suppliers.mobile, q), like(suppliers.city, q))
        )
      )
      .orderBy(desc(suppliers.createdAt))
      .limit(100)
  }

  return db
    .select()
    .from(suppliers)
    .where(isNull(suppliers.deletedAt))
    .orderBy(desc(suppliers.createdAt))
    .limit(100)
}

export async function getSupplier(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))

  return supplier ?? null
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db.update(suppliers).set({ deletedAt: Date.now() }).where(eq(suppliers.id, id))

  revalidatePath("/admin/suppliers")
  return {}
}
