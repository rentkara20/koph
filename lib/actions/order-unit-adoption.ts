// Server actions for adopting free warehouse stock into a client order. The
// rules and queries live in ./order-unit-adoption-core so they can be unit
// tested and so this file exports nothing but async functions, as "use server"
// requires.
"use server"

import { and, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { orderLines, orderUnits } from "@/lib/db/schema"
import { getSessionWithRole } from "@/lib/auth/session"
import { OCCUPYING_ASSET_STATUSES } from "@/lib/domain/asset-status"
import { servingOrder } from "@/lib/db/asset-allocation-sql"
import { assetDisplayNameSql } from "@/lib/db/asset-name"
import {
  AdoptionError,
  adoptUnitsIntoOrderLineCore,
  getAdoptableUnitsCore,
  moveUnitToOrderLineCore,
  releaseUnitFromOrderLineCore,
} from "./order-unit-adoption-core"

type ActionResult = { error?: string; success?: boolean }

const adoptSchema = z.object({
  orderId: z.string().min(1),
  orderLineId: z.string().min(1),
  unitIds: z.array(z.string().min(1)).min(1).max(200),
})

export async function adoptUnitsIntoOrderLine(
  orderId: string,
  orderLineId: string,
  unitIds: string[],
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = adoptSchema.safeParse({ orderId, orderLineId, unitIds })
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  try {
    await db.transaction(async (tx) =>
      adoptUnitsIntoOrderLineCore(tx, d.orderId, d.orderLineId, d.unitIds, session.user.id),
    )
  } catch (error) {
    if (error instanceof AdoptionError) return { error: error.message }
    throw error
  }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath("/admin/assets")
  return { success: true }
}

const unitOnOrderSchema = z.object({
  orderId: z.string().min(1),
  unitId: z.string().min(1),
})

// Undoing an allocation. Adoption used to be one-way, so a device put on the
// wrong line could only be corrected by a production script — see
// scripts/fix-10760-line-allocation-20260830.mts for the correction this
// replaces.
export async function releaseAllocatedUnit(orderId: string, unitId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = unitOnOrderSchema.safeParse({ orderId, unitId })
  if (!parsed.success) return { error: "Invalid input" }

  try {
    await db.transaction(async (tx) =>
      releaseUnitFromOrderLineCore(tx, parsed.data.orderId, parsed.data.unitId, session.user.id),
    )
  } catch (error) {
    if (error instanceof AdoptionError) return { error: error.message }
    throw error
  }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath("/admin/assets")
  return { success: true }
}

const moveSchema = unitOnOrderSchema.extend({ targetLineId: z.string().min(1) })

export async function moveAllocatedUnit(
  orderId: string,
  unitId: string,
  targetLineId: string,
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = moveSchema.safeParse({ orderId, unitId, targetLineId })
  if (!parsed.success) return { error: "Invalid input" }

  try {
    await db.transaction(async (tx) =>
      moveUnitToOrderLineCore(tx, parsed.data.orderId, parsed.data.unitId, parsed.data.targetLineId, session.user.id),
    )
  } catch (error) {
    if (error instanceof AdoptionError) return { error: error.message }
    throw error
  }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath("/admin/assets")
  return { success: true }
}

// Read model for the "adopt warehouse stock" panel on the order devices tab:
// the order's rental lines with how many slots are still free, plus every
// adoptable unit. Rental lines only — a sold_product line never adopts a
// returned rental asset.
export async function getAdoptStockPanel(orderId: string) {
  const session = await getSessionWithRole("admin")
  if (!session) return { lines: [], units: [] }

  return db.transaction(async (tx) => {
    // Ordered, not incidental: the panel used to take whatever line the DB
    // returned first as the pre-selected target, so the device an operator was
    // adding could land on a line they never chose. A stable order is half of
    // that fix; the panel forcing an explicit choice is the other half.
    const lines = await tx
      .select({ id: orderLines.id, description: orderLines.description, quantity: orderLines.quantity })
      .from(orderLines)
      .where(and(eq(orderLines.orderId, orderId), eq(orderLines.type, "rental_asset")))
      .orderBy(orderLines.description, orderLines.id)

    // Who is on each line — not just how many. "0 remaining" alone cannot tell
    // an operator that the two devices holding the line are the wrong model,
    // which is exactly how the order 10760 mix-up stayed invisible.
    const occupants = await tx
      .select({
        lineId: sql<string>`coalesce(${orderUnits.currentOrderLineId}, ${orderUnits.orderLineId})`,
        unitId: orderUnits.id,
        serialNumber: orderUnits.serialNumber,
        assetTag: orderUnits.assetTag,
        status: orderUnits.status,
        description: assetDisplayNameSql(orderLines.description),
      })
      .from(orderUnits)
      .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
      .where(and(servingOrder(orderId), inArray(orderUnits.status, OCCUPYING_ASSET_STATUSES)))

    const occupantsByLine = new Map<string, typeof occupants>()
    for (const occupant of occupants) {
      const list = occupantsByLine.get(occupant.lineId) ?? []
      list.push(occupant)
      occupantsByLine.set(occupant.lineId, list)
    }

    const units = await getAdoptableUnitsCore(tx, orderId)

    return {
      lines: lines.map((l) => {
        const held = occupantsByLine.get(l.id) ?? []
        return {
          id: l.id,
          description: l.description,
          remaining: Math.max(0, l.quantity - held.length),
          occupants: held.map((o) => ({
            unitId: o.unitId,
            serialNumber: o.serialNumber,
            assetTag: o.assetTag,
            description: o.description ?? "",
            // Only a device still in the warehouse can be taken off the line;
            // one already with the customer comes back through a collection.
            removable: o.status === "in_stock",
          })),
        }
      }),
      units,
    }
  })
}
