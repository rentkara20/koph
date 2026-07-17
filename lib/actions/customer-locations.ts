"use server"

import { and, asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  customerContactLocations,
  customerContacts,
  customerLocations,
} from "@/lib/db/schema"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { createId } from "@/lib/utils/ids"
import { buildGoogleMapsLink } from "@/lib/domain/customer-location"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Database = Tx | typeof db

export type CustomerLocationInput = {
  name: string
  type: "office" | "warehouse" | "branch" | "project_site" | "other"
  city?: string
  address?: string
  mapsLink?: string
  googlePlaceId?: string
  latitude?: number | null
  longitude?: number | null
  workingHours?: string
  accessNotes?: string
  isDefault?: boolean
}

const clean = (value?: string) => value?.trim() || null

function normalizeLocationInput(data: CustomerLocationInput) {
  const latitude = Number.isFinite(data.latitude) ? data.latitude! : null
  const longitude = Number.isFinite(data.longitude) ? data.longitude! : null
  return {
    name: data.name.trim(),
    type: data.type,
    city: clean(data.city),
    address: clean(data.address),
    mapsLink: clean(data.mapsLink)
      ?? (latitude !== null && longitude !== null ? buildGoogleMapsLink(latitude, longitude) : null),
    googlePlaceId: clean(data.googlePlaceId),
    latitude,
    longitude,
    workingHours: clean(data.workingHours),
    accessNotes: clean(data.accessNotes),
  }
}

export async function createCustomerLocationCore(
  database: Tx,
  customerId: string,
  data: CustomerLocationInput
) {
  const existing = await database
    .select({ id: customerLocations.id })
    .from(customerLocations)
    .where(eq(customerLocations.customerId, customerId))
    .limit(1)
  const makeDefault = data.isDefault === true || existing.length === 0

  if (makeDefault) {
    await database
      .update(customerLocations)
      .set({ isDefault: false, updatedAt: Date.now() })
      .where(eq(customerLocations.customerId, customerId))
  }

  const location = {
    id: createId(),
    customerId,
    ...normalizeLocationInput(data),
    isDefault: makeDefault,
  }
  await database.insert(customerLocations).values(location)
  return location
}

export async function setDefaultCustomerLocationCore(
  database: Tx,
  customerId: string,
  locationId: string
) {
  const [location] = await database
    .select({ id: customerLocations.id })
    .from(customerLocations)
    .where(and(eq(customerLocations.id, locationId), eq(customerLocations.customerId, customerId)))
  if (!location) throw new Error("Customer location not found")

  await database
    .update(customerLocations)
    .set({ isDefault: false, updatedAt: Date.now() })
    .where(eq(customerLocations.customerId, customerId))
  await database
    .update(customerLocations)
    .set({ isDefault: true, isActive: true, updatedAt: Date.now() })
    .where(eq(customerLocations.id, locationId))
}

export async function replaceContactLocationLinksCore(
  database: Tx,
  contactId: string,
  customerId: string,
  locationIds: string[],
  primaryLocationId?: string | null
) {
  const uniqueIds = [...new Set(locationIds.filter(Boolean))]
  const [contact] = await database
    .select({ id: customerContacts.id })
    .from(customerContacts)
    .where(and(eq(customerContacts.id, contactId), eq(customerContacts.customerId, customerId)))
  if (!contact) throw new Error("Customer contact not found")

  if (uniqueIds.length > 0) {
    const valid = await database
      .select({ id: customerLocations.id })
      .from(customerLocations)
      .where(and(
        eq(customerLocations.customerId, customerId),
        inArray(customerLocations.id, uniqueIds)
      ))
    if (valid.length !== uniqueIds.length) throw new Error("Invalid customer location")
  }

  const primary = primaryLocationId && uniqueIds.includes(primaryLocationId)
    ? primaryLocationId
    : null
  await database
    .delete(customerContactLocations)
    .where(eq(customerContactLocations.contactId, contactId))
  if (uniqueIds.length > 0) {
    await database.insert(customerContactLocations).values(
      uniqueIds.map((locationId) => ({
        contactId,
        locationId,
        isPrimary: locationId === primary,
      }))
    )
  }
}

export async function getCustomerLocations(customerId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select()
    .from(customerLocations)
    .where(and(eq(customerLocations.customerId, customerId), eq(customerLocations.isActive, true)))
    .orderBy(asc(customerLocations.name))
}

export async function getCustomerContactLocationLinks(customerId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      contactId: customerContactLocations.contactId,
      locationId: customerContactLocations.locationId,
      isPrimary: customerContactLocations.isPrimary,
    })
    .from(customerContactLocations)
    .innerJoin(customerContacts, eq(customerContacts.id, customerContactLocations.contactId))
    .where(eq(customerContacts.customerId, customerId))
}

export async function createCustomerLocation(customerId: string, data: CustomerLocationInput) {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!data.name?.trim()) return { error: "Location name is required" }

  try {
    const location = await db.transaction((tx) => createCustomerLocationCore(tx, customerId, data))
    revalidatePath(`/admin/customers/${customerId}`)
    return { id: location.id }
  } catch (error) {
    console.error("Failed to create customer location", error)
    return { error: "Failed to create customer location" }
  }
}

export async function updateCustomerLocation(
  locationId: string,
  customerId: string,
  data: CustomerLocationInput
) {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!data.name?.trim()) return { error: "Location name is required" }

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: customerLocations.id })
        .from(customerLocations)
        .where(and(eq(customerLocations.id, locationId), eq(customerLocations.customerId, customerId)))
      if (!existing) throw new Error("Customer location not found")
      if (data.isDefault) await setDefaultCustomerLocationCore(tx, customerId, locationId)
      await tx
        .update(customerLocations)
        .set({ ...normalizeLocationInput(data), updatedAt: Date.now() })
        .where(eq(customerLocations.id, locationId))
    })
    revalidatePath(`/admin/customers/${customerId}`)
    revalidatePath("/admin/requests")
    return {}
  } catch (error) {
    console.error("Failed to update customer location", error)
    return { error: "Failed to update customer location" }
  }
}

export async function setDefaultCustomerLocation(customerId: string, locationId: string) {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  try {
    await db.transaction((tx) => setDefaultCustomerLocationCore(tx, customerId, locationId))
    revalidatePath(`/admin/customers/${customerId}`)
    return {}
  } catch (error) {
    console.error("Failed to set default customer location", error)
    return { error: "Failed to set default customer location" }
  }
}

export async function deleteCustomerLocation(customerId: string, locationId: string) {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  try {
    await db.transaction(async (tx) => {
      const [location] = await tx
        .select({ isDefault: customerLocations.isDefault })
        .from(customerLocations)
        .where(and(eq(customerLocations.id, locationId), eq(customerLocations.customerId, customerId)))
      if (!location) throw new Error("Customer location not found")
      await tx.delete(customerLocations).where(eq(customerLocations.id, locationId))
      if (location.isDefault) {
        const [replacement] = await tx
          .select({ id: customerLocations.id })
          .from(customerLocations)
          .where(eq(customerLocations.customerId, customerId))
          .orderBy(asc(customerLocations.createdAt))
          .limit(1)
        if (replacement) await setDefaultCustomerLocationCore(tx, customerId, replacement.id)
      }
    })
    revalidatePath(`/admin/customers/${customerId}`)
    return {}
  } catch (error) {
    console.error("Failed to delete customer location", error)
    return { error: "Failed to delete customer location" }
  }
}

export async function replaceContactLocationLinks(
  customerId: string,
  contactId: string,
  locationIds: string[],
  primaryLocationId?: string | null
) {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  try {
    await db.transaction((tx) =>
      replaceContactLocationLinksCore(tx, contactId, customerId, locationIds, primaryLocationId)
    )
    revalidatePath(`/admin/customers/${customerId}`)
    return {}
  } catch (error) {
    console.error("Failed to update contact locations", error)
    return { error: "Failed to update contact locations" }
  }
}

export async function getCustomerLocationById(
  database: Database,
  customerId: string,
  locationId: string
) {
  const [location] = await database
    .select()
    .from(customerLocations)
    .where(and(eq(customerLocations.id, locationId), eq(customerLocations.customerId, customerId)))
  return location ?? null
}
