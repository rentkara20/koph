"use server"

import { and, desc, eq, isNull, like, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { customers } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSession } from "@/lib/auth/session"

export type ActionResult = { error?: string; id?: string }

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const id = createId()
  await db.insert(customers).values({
    id,
    name,
    contactPerson: (formData.get("contactPerson") as string) || null,
    mobile: (formData.get("mobile") as string) || null,
    email: (formData.get("email") as string) || null,
    city: (formData.get("city") as string) || null,
    address: (formData.get("address") as string) || null,
    mapsLink: (formData.get("mapsLink") as string) || null,
    notes: (formData.get("notes") as string) || null,
    createdBy: session.user.id,
  })

  revalidatePath("/admin/customers")
  return { id }
}

export async function updateCustomer(id: string, formData: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  await db
    .update(customers)
    .set({
      name,
      contactPerson: (formData.get("contactPerson") as string) || null,
      mobile: (formData.get("mobile") as string) || null,
      email: (formData.get("email") as string) || null,
      city: (formData.get("city") as string) || null,
      address: (formData.get("address") as string) || null,
      mapsLink: (formData.get("mapsLink") as string) || null,
      notes: (formData.get("notes") as string) || null,
      updatedAt: Date.now(),
    })
    .where(eq(customers.id, id))

  revalidatePath("/admin/customers")
  revalidatePath(`/admin/customers/${id}`)
  return { id }
}

export async function getCustomers(search?: string) {
  const session = await getSession()
  if (!session) return []

  if (search?.trim()) {
    const q = `%${search.trim()}%`
    return db
      .select()
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          or(like(customers.name, q), like(customers.mobile, q), like(customers.city, q))
        )
      )
      .orderBy(desc(customers.createdAt))
      .limit(100)
  }

  return db
    .select()
    .from(customers)
    .where(isNull(customers.deletedAt))
    .orderBy(desc(customers.createdAt))
    .limit(100)
}

export async function getCustomer(id: string) {
  const session = await getSession()
  if (!session) return null

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))

  return customer ?? null
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db.update(customers).set({ deletedAt: Date.now() }).where(eq(customers.id, id))

  revalidatePath("/admin/customers")
  return {}
}
