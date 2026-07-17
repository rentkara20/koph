"use server"

import { and, asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { companyLocations } from "@/lib/db/schema"
import { getSessionWithRole } from "@/lib/auth/session"
import { createId } from "@/lib/utils/ids"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type CompanyLocationInput = {
  companyName: string
  name: string
  type: "warehouse" | "office" | "service_center"
  contactName?: string
  contactMobile?: string
  city?: string
  address?: string
  mapsLink?: string
  workingHours?: string
  accessNotes?: string
  isDefault?: boolean
}

export type CompanyLocationResult = { error?: string; id?: string }
export type CompanyLocation = typeof companyLocations.$inferSelect

function clean(value?: string) {
  return value?.trim() || null
}

export async function createCompanyLocationCore(tx: Tx, data: CompanyLocationInput) {
  const [currentDefault] = await tx
    .select({ id: companyLocations.id })
    .from(companyLocations)
    .where(eq(companyLocations.isDefault, true))
    .limit(1)
  const makeDefault = Boolean(data.isDefault || !currentDefault)

  if (makeDefault && currentDefault) {
    await tx
      .update(companyLocations)
      .set({ isDefault: false, updatedAt: Date.now() })
      .where(eq(companyLocations.isDefault, true))
  }

  const location = {
    id: createId(),
    companyName: data.companyName.trim(),
    name: data.name.trim(),
    type: data.type,
    contactName: clean(data.contactName),
    contactMobile: clean(data.contactMobile),
    city: clean(data.city),
    address: clean(data.address),
    mapsLink: clean(data.mapsLink),
    workingHours: clean(data.workingHours),
    accessNotes: clean(data.accessNotes),
    isDefault: makeDefault,
  }
  await tx.insert(companyLocations).values(location)
  return location
}

export async function setDefaultCompanyLocationCore(tx: Tx, id: string) {
  const [target] = await tx
    .select({ id: companyLocations.id })
    .from(companyLocations)
    .where(and(eq(companyLocations.id, id), eq(companyLocations.isActive, true)))
    .limit(1)
  if (!target) throw new Error("Company location not found")

  await tx
    .update(companyLocations)
    .set({ isDefault: false, updatedAt: Date.now() })
    .where(eq(companyLocations.isDefault, true))
  await tx
    .update(companyLocations)
    .set({ isDefault: true, updatedAt: Date.now() })
    .where(eq(companyLocations.id, id))
}

export async function getCompanyLocations() {
  const session = await getSessionWithRole("admin")
  if (!session) return []
  return db
    .select()
    .from(companyLocations)
    .orderBy(asc(companyLocations.createdAt))
}

export async function getDefaultCompanyLocation() {
  const [preferred] = await db
    .select()
    .from(companyLocations)
    .where(and(eq(companyLocations.isDefault, true), eq(companyLocations.isActive, true)))
    .limit(1)
  if (preferred) return preferred

  const [fallback] = await db
    .select()
    .from(companyLocations)
    .where(eq(companyLocations.isActive, true))
    .orderBy(asc(companyLocations.createdAt))
    .limit(1)
  return fallback ?? null
}

export async function createCompanyLocation(data: CompanyLocationInput): Promise<CompanyLocationResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!data.companyName?.trim()) return { error: "Company name is required" }
  if (!data.name?.trim()) return { error: "Location name is required" }

  try {
    const location = await db.transaction((tx) => createCompanyLocationCore(tx, data))
    revalidatePath("/admin/settings/company-locations")
    revalidatePath("/admin/requests")
    return { id: location.id }
  } catch (error) {
    console.error("Failed to create company location", error)
    return { error: "Failed to create company location" }
  }
}

export async function updateCompanyLocation(
  id: string,
  data: Omit<CompanyLocationInput, "isDefault">
): Promise<CompanyLocationResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!data.companyName?.trim()) return { error: "Company name is required" }
  if (!data.name?.trim()) return { error: "Location name is required" }

  await db
    .update(companyLocations)
    .set({
      companyName: data.companyName.trim(),
      name: data.name.trim(),
      type: data.type,
      contactName: clean(data.contactName),
      contactMobile: clean(data.contactMobile),
      city: clean(data.city),
      address: clean(data.address),
      mapsLink: clean(data.mapsLink),
      workingHours: clean(data.workingHours),
      accessNotes: clean(data.accessNotes),
      updatedAt: Date.now(),
    })
    .where(eq(companyLocations.id, id))

  revalidatePath("/admin/settings/company-locations")
  revalidatePath("/admin/requests")
  return { id }
}

export async function setDefaultCompanyLocation(id: string): Promise<CompanyLocationResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  try {
    await db.transaction((tx) => setDefaultCompanyLocationCore(tx, id))
    revalidatePath("/admin/settings/company-locations")
    revalidatePath("/admin/requests")
    return { id }
  } catch (error) {
    console.error("Failed to set default company location", error)
    return { error: "Failed to set default company location" }
  }
}

export async function deleteCompanyLocation(id: string): Promise<CompanyLocationResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  try {
    await db.transaction(async (tx) => {
      const [location] = await tx
        .select({ isDefault: companyLocations.isDefault })
        .from(companyLocations)
        .where(eq(companyLocations.id, id))
      if (!location) throw new Error("Company location not found")

      await tx.delete(companyLocations).where(eq(companyLocations.id, id))
      if (location.isDefault) {
        const [replacement] = await tx
          .select({ id: companyLocations.id })
          .from(companyLocations)
          .where(eq(companyLocations.isActive, true))
          .orderBy(asc(companyLocations.createdAt))
          .limit(1)
        if (replacement) await setDefaultCompanyLocationCore(tx, replacement.id)
      }
    })
    revalidatePath("/admin/settings/company-locations")
    revalidatePath("/admin/requests")
    return { id }
  } catch (error) {
    console.error("Failed to delete company location", error)
    return { error: "Failed to delete company location" }
  }
}
