"use server"

import { asc, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { servicesCatalog } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSession, getSessionWithRole } from "@/lib/auth/session"

export type ServiceActionResult = { error?: string; id?: string }

export async function getServices() {
  const session = await getSession()
  if (!session) return []

  return db
    .select()
    .from(servicesCatalog)
    .orderBy(asc(servicesCatalog.sortOrder), asc(servicesCatalog.createdAt))
}

export async function getActiveServices() {
  return db
    .select()
    .from(servicesCatalog)
    .where(eq(servicesCatalog.isActive, true))
    .orderBy(asc(servicesCatalog.sortOrder))
}

export async function createService(data: {
  nameEn: string
  nameAr: string
}): Promise<ServiceActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!data.nameEn?.trim()) return { error: "English name is required" }
  if (!data.nameAr?.trim()) return { error: "Arabic name is required" }

  const [last] = await db
    .select({ sortOrder: servicesCatalog.sortOrder })
    .from(servicesCatalog)
    .orderBy(desc(servicesCatalog.sortOrder))
    .limit(1)

  const id = createId()
  await db.insert(servicesCatalog).values({
    id,
    nameEn: data.nameEn.trim(),
    nameAr: data.nameAr.trim(),
    sortOrder: (last?.sortOrder ?? -1) + 1,
    createdBy: session.user.id,
  })

  revalidatePath("/admin/settings/services")
  return { id }
}

export async function updateService(
  id: string,
  data: { nameEn?: string; nameAr?: string }
): Promise<ServiceActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db
    .update(servicesCatalog)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(servicesCatalog.id, id))

  revalidatePath("/admin/settings/services")
  return { id }
}

export async function toggleService(id: string): Promise<ServiceActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [svc] = await db.select().from(servicesCatalog).where(eq(servicesCatalog.id, id))
  if (!svc) return { error: "Not found" }

  await db
    .update(servicesCatalog)
    .set({ isActive: !svc.isActive, updatedAt: Date.now() })
    .where(eq(servicesCatalog.id, id))

  revalidatePath("/admin/settings/services")
  return { id }
}

export async function moveService(
  id: string,
  direction: "up" | "down"
): Promise<ServiceActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const all = await db.select().from(servicesCatalog).orderBy(asc(servicesCatalog.sortOrder))
  const idx = all.findIndex((s) => s.id === id)
  if (idx === -1) return { error: "Not found" }

  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= all.length) return { id }

  const a = all[idx]
  const b = all[swapIdx]

  await db
    .update(servicesCatalog)
    .set({ sortOrder: b.sortOrder, updatedAt: Date.now() })
    .where(eq(servicesCatalog.id, a.id))
  await db
    .update(servicesCatalog)
    .set({ sortOrder: a.sortOrder, updatedAt: Date.now() })
    .where(eq(servicesCatalog.id, b.id))

  revalidatePath("/admin/settings/services")
  return { id }
}
