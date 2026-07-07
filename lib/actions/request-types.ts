"use server"

import { asc, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requestTypes } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole } from "@/lib/auth/session"
import { SYSTEM_REQUEST_TYPE_SLUGS } from "@/lib/domain/request-types"

export type RequestTypeActionResult = { error?: string; id?: string }

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50)
}

export async function getAllRequestTypes() {
  return db.select().from(requestTypes).orderBy(asc(requestTypes.sortOrder), asc(requestTypes.createdAt))
}

export async function createRequestType(data: {
  nameEn: string
  nameAr: string
}): Promise<RequestTypeActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!data.nameEn?.trim()) return { error: "English name is required" }
  if (!data.nameAr?.trim()) return { error: "Arabic name is required" }

  const slug = slugify(data.nameEn)
  if (!slug) return { error: "Could not derive a slug from the English name" }

  const [existing] = await db.select({ id: requestTypes.id }).from(requestTypes).where(eq(requestTypes.slug, slug))
  if (existing) return { error: "A request type with this name already exists" }

  const [last] = await db
    .select({ sortOrder: requestTypes.sortOrder })
    .from(requestTypes)
    .orderBy(desc(requestTypes.sortOrder))
    .limit(1)

  const id = createId()
  await db.insert(requestTypes).values({
    id,
    slug,
    nameEn: data.nameEn.trim(),
    nameAr: data.nameAr.trim(),
    sortOrder: (last?.sortOrder ?? -1) + 1,
  })

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}

export async function updateRequestType(
  id: string,
  data: { nameEn?: string; nameAr?: string }
): Promise<RequestTypeActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  // Slug is intentionally immutable here — request creation, task type
  // linkage, and the delivery/collection asset-lifecycle branch all key off
  // it, not the display name.
  await db.update(requestTypes).set(data).where(eq(requestTypes.id, id))

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}

export async function toggleRequestType(id: string): Promise<RequestTypeActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [type] = await db.select().from(requestTypes).where(eq(requestTypes.id, id))
  if (!type) return { error: "Not found" }
  if (
    type.isActive &&
    SYSTEM_REQUEST_TYPE_SLUGS.includes(type.slug as (typeof SYSTEM_REQUEST_TYPE_SLUGS)[number])
  ) {
    return { error: "This request type drives the asset delivery/return workflow and cannot be disabled" }
  }

  await db.update(requestTypes).set({ isActive: !type.isActive }).where(eq(requestTypes.id, id))

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}

export async function moveRequestType(
  id: string,
  direction: "up" | "down"
): Promise<RequestTypeActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const all = await db.select().from(requestTypes).orderBy(asc(requestTypes.sortOrder))
  const idx = all.findIndex((t) => t.id === id)
  if (idx === -1) return { error: "Not found" }

  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= all.length) return { id }

  const a = all[idx]
  const b = all[swapIdx]

  await db.update(requestTypes).set({ sortOrder: b.sortOrder }).where(eq(requestTypes.id, a.id))
  await db.update(requestTypes).set({ sortOrder: a.sortOrder }).where(eq(requestTypes.id, b.id))

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}
