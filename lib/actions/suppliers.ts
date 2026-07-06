"use server"

import { and, desc, eq, isNull, like, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { suppliers } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSession, getSessionWithRole } from "@/lib/auth/session"
import { createSupplierSchema, firstError } from "@/lib/validation/schemas"

export type ActionResult = { error?: string; id?: string }

function parseSupplierForm(formData: FormData) {
  return createSupplierSchema.safeParse({
    name: (formData.get("name") as string)?.trim(),
    contactPerson: (formData.get("contactPerson") as string) || undefined,
    mobile: (formData.get("mobile") as string) || undefined,
    email: (formData.get("email") as string) || undefined,
    city: (formData.get("city") as string) || undefined,
    address: (formData.get("address") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  })
}

export async function createSupplier(formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = parseSupplierForm(formData)
  if (!parsed.success) return { error: firstError(parsed.error) }
  const data = parsed.data

  const id = createId()
  await db.insert(suppliers).values({
    id,
    name: data.name,
    contactPerson: data.contactPerson || null,
    mobile: data.mobile || null,
    email: data.email || null,
    city: data.city || null,
    address: data.address || null,
    notes: data.notes || null,
    createdBy: session.user.id,
  })

  revalidatePath("/admin/suppliers")
  return { id }
}

export async function updateSupplier(id: string, formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = parseSupplierForm(formData)
  if (!parsed.success) return { error: firstError(parsed.error) }
  const data = parsed.data

  await db
    .update(suppliers)
    .set({
      name: data.name,
      contactPerson: data.contactPerson || null,
      mobile: data.mobile || null,
      email: data.email || null,
      city: data.city || null,
      address: data.address || null,
      notes: data.notes || null,
      updatedAt: Date.now(),
    })
    .where(eq(suppliers.id, id))

  revalidatePath("/admin/suppliers")
  revalidatePath(`/admin/suppliers/${id}`)
  return { id }
}

export async function getSuppliers(search?: string) {
  const session = await getSession()
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
  const session = await getSession()
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
