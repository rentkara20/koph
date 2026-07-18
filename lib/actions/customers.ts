"use server"

import { and, desc, eq, isNull, like, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { customers } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"

export type ActionResult = { error?: string; id?: string }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type CustomerCoreInput = {
  name: string
  contactPerson?: string | null
  mobile?: string | null
  email?: string | null
  city?: string | null
  address?: string | null
  mapsLink?: string | null
  notes?: string | null
}

// Tx-scoped create, reused by the "use server" wrapper below AND the CSV
// Import/Export Center. Throws on invalid input (mirrors createAssetCore's
// throw-in-Core / catch-in-wrapper convention) rather than returning an error
// envelope, since a Core function has no ActionResult contract to honor.
export async function createCustomerCore(
  tx: Tx,
  input: CustomerCoreInput,
  actorUserId: string | null
): Promise<{ id: string }> {
  const name = input.name?.trim()
  if (!name) throw new Error("Name is required")

  const id = createId()
  await tx.insert(customers).values({
    id,
    name,
    contactPerson: input.contactPerson || null,
    mobile: input.mobile || null,
    email: input.email || null,
    city: input.city || null,
    address: input.address || null,
    mapsLink: input.mapsLink || null,
    notes: input.notes || null,
    createdBy: actorUserId,
  })

  return { id }
}

export async function updateCustomerCore(
  tx: Tx,
  id: string,
  input: CustomerCoreInput
): Promise<{ id: string }> {
  const name = input.name?.trim()
  if (!name) throw new Error("Name is required")

  await tx
    .update(customers)
    .set({
      name,
      contactPerson: input.contactPerson || null,
      mobile: input.mobile || null,
      email: input.email || null,
      city: input.city || null,
      address: input.address || null,
      mapsLink: input.mapsLink || null,
      notes: input.notes || null,
      updatedAt: Date.now(),
    })
    .where(eq(customers.id, id))

  return { id }
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const input: CustomerCoreInput = {
    name: (formData.get("name") as string) ?? "",
    contactPerson: (formData.get("contactPerson") as string) || null,
    mobile: (formData.get("mobile") as string) || null,
    email: (formData.get("email") as string) || null,
    city: (formData.get("city") as string) || null,
    address: (formData.get("address") as string) || null,
    mapsLink: (formData.get("mapsLink") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }

  let id = ""
  try {
    await db.transaction(async (tx) => {
      const result = await createCustomerCore(tx, input, session.user.id)
      id = result.id
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create customer" }
  }

  revalidatePath("/admin/customers")
  return { id }
}

export async function updateCustomer(id: string, formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const input: CustomerCoreInput = {
    name: (formData.get("name") as string) ?? "",
    contactPerson: (formData.get("contactPerson") as string) || null,
    mobile: (formData.get("mobile") as string) || null,
    email: (formData.get("email") as string) || null,
    city: (formData.get("city") as string) || null,
    address: (formData.get("address") as string) || null,
    mapsLink: (formData.get("mapsLink") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }

  try {
    await db.transaction(async (tx) => {
      await updateCustomerCore(tx, id, input)
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update customer" }
  }

  revalidatePath("/admin/customers")
  revalidatePath(`/admin/customers/${id}`)
  return { id }
}

export async function getCustomers(search?: string) {
  const session = await getStaffSession()
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
  const session = await getStaffSession()
  if (!session) return null

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))

  return customer ?? null
}

// ─── Focused option lookups for searchable pickers ───────────────────────────
// Minimal {id, name} projections used by async SearchableSelect. Server-side
// search so results are never capped at a preloaded window; every action is
// auth-guarded and returns a small, bounded result set.

export type CustomerOption = { id: string; name: string }

type Database = typeof db

const OPTION_SEARCH_LIMIT = 20

// Core query, db-injectable so it is unit-testable against a fresh test db.
export async function searchCustomersCore(
  database: Database,
  query?: string,
  limit = OPTION_SEARCH_LIMIT
): Promise<CustomerOption[]> {
  const projection = { id: customers.id, name: customers.name }
  const q = query?.trim()
  if (q) {
    const like_ = `%${q}%`
    return database
      .select(projection)
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          or(like(customers.name, like_), like(customers.mobile, like_), like(customers.city, like_))
        )
      )
      .orderBy(desc(customers.createdAt))
      .limit(limit)
  }

  return database
    .select(projection)
    .from(customers)
    .where(isNull(customers.deletedAt))
    .orderBy(desc(customers.createdAt))
    .limit(limit)
}

export async function getCustomerByIdCore(
  database: Database,
  id: string
): Promise<CustomerOption | null> {
  const [customer] = await database
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
  return customer ?? null
}

export async function searchCustomers(query?: string): Promise<CustomerOption[]> {
  const session = await getStaffSession()
  if (!session) return []
  return searchCustomersCore(db, query)
}

export async function getCustomerById(id: string): Promise<CustomerOption | null> {
  const session = await getStaffSession()
  if (!session) return null
  return getCustomerByIdCore(db, id)
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db.update(customers).set({ deletedAt: Date.now() }).where(eq(customers.id, id))

  revalidatePath("/admin/customers")
  return {}
}
