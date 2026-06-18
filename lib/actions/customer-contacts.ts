"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { customerContacts } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSession } from "@/lib/auth/session"

export type ContactInput = {
  name: string
  role?: string
  mobile?: string
  email?: string
  city?: string
  address?: string
  mapsLink?: string
  notes?: string
}

export async function getCustomerContacts(customerId: string) {
  try {
    return await db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.customerId, customerId))
      .orderBy(customerContacts.createdAt)
  } catch {
    // Table not yet created — return empty until migration runs at /api/migrate-contacts
    return []
  }
}

export async function createCustomerContact(
  customerId: string,
  data: ContactInput
): Promise<{ error?: string; id?: string }> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }
  if (!data.name?.trim()) return { error: "Name is required" }

  const id = createId()
  await db.insert(customerContacts).values({
    id,
    customerId,
    name: data.name.trim(),
    role: data.role?.trim() || null,
    mobile: data.mobile?.trim() || null,
    email: data.email?.trim() || null,
    city: data.city?.trim() || null,
    address: data.address?.trim() || null,
    mapsLink: data.mapsLink?.trim() || null,
    notes: data.notes?.trim() || null,
  })

  revalidatePath(`/admin/customers/${customerId}`)
  return { id }
}

export async function updateCustomerContact(
  id: string,
  customerId: string,
  data: ContactInput
): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }
  if (!data.name?.trim()) return { error: "Name is required" }

  await db
    .update(customerContacts)
    .set({
      name: data.name.trim(),
      role: data.role?.trim() || null,
      mobile: data.mobile?.trim() || null,
      email: data.email?.trim() || null,
      city: data.city?.trim() || null,
      address: data.address?.trim() || null,
      mapsLink: data.mapsLink?.trim() || null,
      notes: data.notes?.trim() || null,
      updatedAt: Date.now(),
    })
    .where(eq(customerContacts.id, id))

  revalidatePath(`/admin/customers/${customerId}`)
  return {}
}

export async function deleteCustomerContact(
  id: string,
  customerId: string
): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db.delete(customerContacts).where(eq(customerContacts.id, id))
  revalidatePath(`/admin/customers/${customerId}`)
  return {}
}
