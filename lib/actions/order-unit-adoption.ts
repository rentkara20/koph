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
import {
  AdoptionError,
  adoptUnitsIntoOrderLineCore,
  getAdoptableUnitsCore,
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

// Read model for the "adopt warehouse stock" panel on the order devices tab:
// the order's rental lines with how many slots are still free, plus every
// adoptable unit. Rental lines only — a sold_product line never adopts a
// returned rental asset.
export async function getAdoptStockPanel(orderId: string) {
  const session = await getSessionWithRole("admin")
  if (!session) return { lines: [], units: [] }

  return db.transaction(async (tx) => {
    const lines = await tx
      .select({ id: orderLines.id, description: orderLines.description, quantity: orderLines.quantity })
      .from(orderLines)
      .where(and(eq(orderLines.orderId, orderId), eq(orderLines.type, "rental_asset")))

    // Occupancy per line follows the same serving rule the rest of the order
    // views use: current allocation wins, origin is the fallback.
    const occupancy = await tx
      .select({
        lineId: sql<string>`coalesce(${orderUnits.currentOrderLineId}, ${orderUnits.orderLineId})`,
        n: sql<number>`count(*)`,
      })
      .from(orderUnits)
      .where(and(servingOrder(orderId), inArray(orderUnits.status, OCCUPYING_ASSET_STATUSES)))
      .groupBy(sql`coalesce(${orderUnits.currentOrderLineId}, ${orderUnits.orderLineId})`)
    const occupiedByLine = new Map(occupancy.map((o) => [o.lineId, Number(o.n)]))

    const units = await getAdoptableUnitsCore(tx, orderId)

    return {
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        remaining: Math.max(0, l.quantity - (occupiedByLine.get(l.id) ?? 0)),
      })),
      units,
    }
  })
}
