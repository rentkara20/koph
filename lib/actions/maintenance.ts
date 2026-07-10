"use server"

import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { maintenanceOrders, orderUnits } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { firstError } from "@/lib/validation/schemas"
import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"

type ActionResult = { error?: string; id?: string }

const openSchema = z.object({
  assetId: z.string().trim().min(1).max(60),
  issue: z.string().trim().min(1).max(1000),
})

// ─── Open a maintenance order: flips the asset to `maintenance` and files
// the work order in one transaction. ───────────────────────────────────────
export async function openMaintenanceOrder(
  assetId: string,
  issue: string
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = openSchema.safeParse({ assetId, issue })
  if (!parsed.success) return { error: firstError(parsed.error) }

  const id = createId()
  try {
    await db.transaction(async (tx) => {
      await tx.insert(maintenanceOrders).values({
        id,
        assetId,
        issue: parsed.data.issue,
        status: "open",
        openedBy: session.user.id,
      })
      await applyAssetTransition(tx, assetId, "send_maintenance", { byUserId: session.user.id })
    })
  } catch (error) {
    if (error instanceof AssetTransitionError) return { error: error.message }
    throw error
  }

  revalidatePath("/admin/maintenance")
  revalidatePath(`/admin/assets/${assetId}`)
  return { id }
}

export async function startMaintenanceWork(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [order] = await db.select().from(maintenanceOrders).where(eq(maintenanceOrders.id, id))
  if (!order) return { error: "Not found" }
  if (order.status !== "open") return { error: "Invalid action for current asset status" }

  await db.update(maintenanceOrders).set({ status: "in_progress" }).where(eq(maintenanceOrders.id, id))
  revalidatePath("/admin/maintenance")
  return { id }
}

const closeSchema = z.object({
  cost: z.number().min(0).max(1_000_000).optional(),
  vendorNotes: z.string().trim().max(2000).optional(),
})

// ─── Close a maintenance order as done: records the cost and returns the
// asset to stock. Cancel keeps the asset in maintenance-review state — an
// admin must still separately transition it. ───────────────────────────────
export async function closeMaintenanceOrder(
  id: string,
  outcome: "done" | "cancelled",
  data: { cost?: number; vendorNotes?: string } = {}
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = closeSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const [order] = await db.select().from(maintenanceOrders).where(eq(maintenanceOrders.id, id))
  if (!order) return { error: "Not found" }
  if (order.status === "done" || order.status === "cancelled") {
    return { error: "Invalid action for current asset status" }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(maintenanceOrders)
        .set({
          status: outcome,
          cost: parsed.data.cost ?? null,
          vendorNotes: parsed.data.vendorNotes || null,
          closedAt: Date.now(),
        })
        .where(eq(maintenanceOrders.id, id))

      if (outcome === "done") {
        await applyAssetTransition(tx, order.assetId, "repair_done", { byUserId: session.user.id })
      }
    })
  } catch (error) {
    if (error instanceof AssetTransitionError) return { error: error.message }
    throw error
  }

  revalidatePath("/admin/maintenance")
  revalidatePath(`/admin/assets/${order.assetId}`)
  return { id }
}

export async function getMaintenanceOrders() {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({
      id: maintenanceOrders.id,
      assetId: maintenanceOrders.assetId,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      issue: maintenanceOrders.issue,
      status: maintenanceOrders.status,
      cost: maintenanceOrders.cost,
      openedAt: maintenanceOrders.openedAt,
      closedAt: maintenanceOrders.closedAt,
    })
    .from(maintenanceOrders)
    .innerJoin(orderUnits, eq(maintenanceOrders.assetId, orderUnits.id))
    .orderBy(desc(maintenanceOrders.openedAt))
    .limit(200)
}

export async function getMaintenanceOrdersForAsset(assetId: string) {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select()
    .from(maintenanceOrders)
    .where(eq(maintenanceOrders.assetId, assetId))
    .orderBy(desc(maintenanceOrders.openedAt))
}
