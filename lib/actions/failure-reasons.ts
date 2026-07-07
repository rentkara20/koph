"use server"

import { asc, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { failureReasons } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole } from "@/lib/auth/session"

export type FailureReasonActionResult = { error?: string; id?: string }

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50)
}

export async function getFailureReasons() {
  return db.select().from(failureReasons).orderBy(asc(failureReasons.sortOrder), asc(failureReasons.createdAt))
}

/** Public — read by the partner magic-link task page to populate the dropdown. */
export async function getActiveFailureReasons() {
  return db
    .select()
    .from(failureReasons)
    .where(eq(failureReasons.isActive, true))
    .orderBy(asc(failureReasons.sortOrder))
}

export async function isValidActiveFailureReason(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: failureReasons.id })
    .from(failureReasons)
    .where(eq(failureReasons.slug, slug))
  return !!row
}

export async function createFailureReason(data: {
  nameEn: string
  nameAr: string
}): Promise<FailureReasonActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!data.nameEn?.trim()) return { error: "English name is required" }
  if (!data.nameAr?.trim()) return { error: "Arabic name is required" }

  const slug = slugify(data.nameEn)
  if (!slug) return { error: "Could not derive a slug from the English name" }

  const [existing] = await db.select({ id: failureReasons.id }).from(failureReasons).where(eq(failureReasons.slug, slug))
  if (existing) return { error: "A reason with this name already exists" }

  const [last] = await db
    .select({ sortOrder: failureReasons.sortOrder })
    .from(failureReasons)
    .orderBy(desc(failureReasons.sortOrder))
    .limit(1)

  const id = createId()
  await db.insert(failureReasons).values({
    id,
    slug,
    nameEn: data.nameEn.trim(),
    nameAr: data.nameAr.trim(),
    sortOrder: (last?.sortOrder ?? -1) + 1,
  })

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}

export async function updateFailureReason(
  id: string,
  data: { nameEn?: string; nameAr?: string }
): Promise<FailureReasonActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  // Slug (and therefore any partner_task rows already stored with it) stays
  // stable — only display names change.
  await db.update(failureReasons).set(data).where(eq(failureReasons.id, id))

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}

export async function toggleFailureReason(id: string): Promise<FailureReasonActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [reason] = await db.select().from(failureReasons).where(eq(failureReasons.id, id))
  if (!reason) return { error: "Not found" }

  await db.update(failureReasons).set({ isActive: !reason.isActive }).where(eq(failureReasons.id, id))

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}

export async function moveFailureReason(
  id: string,
  direction: "up" | "down"
): Promise<FailureReasonActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const all = await db.select().from(failureReasons).orderBy(asc(failureReasons.sortOrder))
  const idx = all.findIndex((r) => r.id === id)
  if (idx === -1) return { error: "Not found" }

  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= all.length) return { id }

  const a = all[idx]
  const b = all[swapIdx]

  await db.update(failureReasons).set({ sortOrder: b.sortOrder }).where(eq(failureReasons.id, a.id))
  await db.update(failureReasons).set({ sortOrder: a.sortOrder }).where(eq(failureReasons.id, b.id))

  revalidatePath("/admin/settings/request-tasks")
  return { id }
}
