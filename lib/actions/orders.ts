"use server"

import { and, desc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  customers,
  orderLines,
  orderUnits,
  orders,
  requestItems,
  requests,
  requestTypes,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import { applyAssetStatusCorrection } from "@/lib/actions/asset-transition"
import {
  createOrderSchema,
  firstError,
  orderUnitInputSchema,
  updateOrderSchema,
} from "@/lib/validation/schemas"
import { deriveOrderStatus } from "@/lib/utils/order-status"
import { z } from "zod"

export type ActionResult = { error?: string; id?: string }

// Best-effort informational line total (not billed in v1).
function computeLineTotal(quantity: number, unitPriceMonthly?: number, rentalMonths?: number) {
  if (unitPriceMonthly == null) return null
  const months = rentalMonths && rentalMonths > 0 ? rentalMonths : 1
  return quantity * unitPriceMonthly * months
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createOrder(
  data: z.infer<typeof createOrderSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createOrderSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }
  const d = parsed.data

  // Enforce unique order number (friendly message instead of a DB constraint throw).
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.orderNumber, d.orderNumber), isNull(orders.deletedAt)))
  if (existing.length > 0) return { error: "Order number already exists" }

  const id = createId()
  const lineTotals = d.lines.map((l) =>
    computeLineTotal(l.quantity, l.unitPriceMonthly, l.rentalMonths)
  )
  const total = lineTotals.reduce<number | null>((acc, lt) => {
    if (lt == null) return acc
    return (acc ?? 0) + lt
  }, null)

  await db.insert(orders).values({
    id,
    orderNumber: d.orderNumber,
    customerId: d.customerId,
    contactPerson: d.contactPerson || null,
    contactMobile: d.contactMobile || null,
    contactEmail: d.contactEmail || null,
    quoteDate: d.quoteDate ? new Date(d.quoteDate).getTime() : null,
    rentalPeriodMonths: d.rentalPeriodMonths ?? null,
    additionalPeriodMonths: d.additionalPeriodMonths ?? null,
    total,
    status: "draft",
    notes: d.notes || null,
    createdBy: session.user.id,
  })

  if (d.lines.length > 0) {
    await db.insert(orderLines).values(
      d.lines.map((l, i) => ({
        id: createId(),
        orderId: id,
        description: l.description,
        brand: l.brand || null,
        model: l.model || null,
        quantity: l.quantity,
        rentalMonths: l.rentalMonths ?? null,
        unitPriceMonthly: l.unitPriceMonthly ?? null,
        lineTotal: lineTotals[i],
        notes: l.notes || null,
      }))
    )
  }

  revalidatePath("/admin/orders")
  return { id }
}

// ─── Update header + lines (replace strategy) ─────────────────────────────────

export async function updateOrder(
  id: string,
  data: z.infer<typeof updateOrderSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = updateOrderSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }
  const d = parsed.data

  const dupe = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.orderNumber, d.orderNumber), isNull(orders.deletedAt)))
  if (dupe.some((row) => row.id !== id)) return { error: "Order number already exists" }

  // Status is derived from unit fulfillment, not editable from this form —
  // preserve whatever is currently stored (cancel/reopen use their own action).
  const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id))
  const status = current?.status ?? "draft"

  const lineTotals = d.lines.map((l) =>
    computeLineTotal(l.quantity, l.unitPriceMonthly, l.rentalMonths)
  )
  const total = lineTotals.reduce<number | null>((acc, lt) => {
    if (lt == null) return acc
    return (acc ?? 0) + lt
  }, null)

  // Reconcile lines: update kept, insert new, delete removed. FK cascade is NOT
  // enforced at runtime (no PRAGMA foreign_keys), so unit cleanup is explicit.
  const existingLines = await db
    .select({ id: orderLines.id })
    .from(orderLines)
    .where(eq(orderLines.orderId, id))
  const existingIds = new Set(existingLines.map((l) => l.id))
  const keptIds = new Set(d.lines.map((l) => l.id).filter((v): v is string => Boolean(v)))

  const toDelete = [...existingIds].filter((lid) => !keptIds.has(lid))
  if (toDelete.length > 0) {
    // Refuse to drop a line whose devices are already committed to a request —
    // deleting them would orphan request history. Only in_stock units are removable.
    const committed = await db
      .select({ id: orderUnits.id })
      .from(orderUnits)
      .where(and(inArray(orderUnits.orderLineId, toDelete), ne(orderUnits.status, "in_stock")))
    if (committed.length > 0) {
      return { error: "Cannot remove an item whose devices are already assigned to a request" }
    }
  }

  // All writes are atomic: a mid-reconcile failure must not leave the order
  // header updated with half of its lines saved.
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        orderNumber: d.orderNumber,
        customerId: d.customerId,
        contactPerson: d.contactPerson || null,
        contactMobile: d.contactMobile || null,
        contactEmail: d.contactEmail || null,
        quoteDate: d.quoteDate ? new Date(d.quoteDate).getTime() : null,
        rentalPeriodMonths: d.rentalPeriodMonths ?? null,
        additionalPeriodMonths: d.additionalPeriodMonths ?? null,
        total,
        status,
        notes: d.notes || null,
        updatedAt: Date.now(),
      })
      .where(eq(orders.id, id))

    if (toDelete.length > 0) {
      // Explicitly delete the (in_stock only) units, then the lines.
      await tx.delete(orderUnits).where(inArray(orderUnits.orderLineId, toDelete))
      await tx.delete(orderLines).where(inArray(orderLines.id, toDelete))
    }

    const toInsert: (typeof orderLines.$inferInsert)[] = []
    for (let i = 0; i < d.lines.length; i++) {
      const l = d.lines[i]
      if (l.id && existingIds.has(l.id)) {
        await tx
          .update(orderLines)
          .set({
            description: l.description,
            brand: l.brand || null,
            model: l.model || null,
            quantity: l.quantity,
            rentalMonths: l.rentalMonths ?? null,
            unitPriceMonthly: l.unitPriceMonthly ?? null,
            lineTotal: lineTotals[i],
            notes: l.notes || null,
            updatedAt: Date.now(),
          })
          .where(eq(orderLines.id, l.id))
      } else {
        toInsert.push({
          id: createId(),
          orderId: id,
          description: l.description,
          brand: l.brand || null,
          model: l.model || null,
          quantity: l.quantity,
          rentalMonths: l.rentalMonths ?? null,
          unitPriceMonthly: l.unitPriceMonthly ?? null,
          lineTotal: lineTotals[i],
          notes: l.notes || null,
        })
      }
    }
    if (toInsert.length > 0) await tx.insert(orderLines).values(toInsert)
  })

  revalidatePath("/admin/orders")
  revalidatePath(`/admin/orders/${id}`)
  return { id }
}

// ─── Units management (serials + supplier + cost) ────────────────────────────

const saveUnitsSchema = z.object({
  orderId: z.string().trim().min(1).max(60),
  units: z.array(orderUnitInputSchema).max(2000),
})

export async function saveOrderUnits(
  orderId: string,
  units: z.infer<typeof orderUnitInputSchema>[]
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = saveUnitsSchema.safeParse({ orderId, units })
  if (!parsed.success) return { error: firstError(parsed.error) }
  const d = parsed.data

  // Every unit must belong to a line of THIS order (guard against tampering).
  const lines = await db
    .select({ id: orderLines.id })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId))
  const lineIds = new Set(lines.map((l) => l.id))
  if (d.units.some((u) => !lineIds.has(u.orderLineId))) {
    return { error: "Invalid line reference" }
  }

  const existing = await db
    .select({ id: orderUnits.id, status: orderUnits.status })
    .from(orderUnits)
    .where(eq(orderUnits.orderId, orderId))
  const existingIds = new Set(existing.map((u) => u.id))
  const existingStatusById = new Map(existing.map((u) => [u.id, u.status]))
  const keptIds = new Set(d.units.map((u) => u.id).filter((v): v is string => Boolean(v)))

  // Do not delete units already consumed by a request (assigned/delivered).
  const protectedIds = new Set(
    existing.filter((u) => u.status !== "in_stock").map((u) => u.id)
  )
  const toDelete = [...existingIds].filter((uid) => !keptIds.has(uid) && !protectedIds.has(uid))

  // Atomic reconcile: a mid-loop failure must not leave units half-saved.
  await db.transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.delete(orderUnits).where(inArray(orderUnits.id, toDelete))
    }

    const toInsert: (typeof orderUnits.$inferInsert)[] = []
    for (const u of d.units) {
      if (u.id && existingIds.has(u.id)) {
        // Status changes go through the OI-1 chokepoint (via the correction
        // path, since this bulk editor works from a target status rather than
        // a named business action) so every status change on an existing unit
        // still gets a validated transition and an atomic asset_event — no
        // direct status write remains for this caller.
        await tx
          .update(orderUnits)
          .set({
            orderLineId: u.orderLineId,
            serialNumber: u.serialNumber || null,
            supplierId: u.supplierId || null,
            purchaseCost: u.purchaseCost ?? null,
            notes: u.notes || null,
            updatedAt: Date.now(),
          })
          .where(eq(orderUnits.id, u.id))

        const nextStatus = u.status ?? "in_stock"
        const currentStatus = existingStatusById.get(u.id)
        if (currentStatus && nextStatus !== currentStatus) {
          await applyAssetStatusCorrection(tx, u.id, nextStatus, { byUserId: session.user.id })
        }
      } else {
        toInsert.push({
          id: createId(),
          orderId,
          orderLineId: u.orderLineId,
          serialNumber: u.serialNumber || null,
          supplierId: u.supplierId || null,
          purchaseCost: u.purchaseCost ?? null,
          status: u.status ?? "in_stock",
          notes: u.notes || null,
        })
      }
    }
    if (toInsert.length > 0) await tx.insert(orderUnits).values(toInsert)
  })

  // Recompute order.status from the units' final fulfillment state.
  const [orderRow] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId))
  const finalUnits = await db.select({ status: orderUnits.status }).from(orderUnits).where(eq(orderUnits.orderId, orderId))
  const nextStatus = deriveOrderStatus(
    finalUnits.map((u) => u.status),
    orderRow?.status ?? "draft"
  )
  if (nextStatus !== orderRow?.status) {
    await db.update(orders).set({ status: nextStatus, updatedAt: Date.now() }).where(eq(orders.id, orderId))
  }

  revalidatePath(`/admin/orders/${orderId}`)
  return { id: orderId }
}

// ─── Manual cancel / reopen (the only human-set status transition) ───────────

export async function setOrderCancelled(id: string, cancelled: boolean): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (cancelled) {
    await db.update(orders).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(orders.id, id))
  } else {
    // Reopen: recompute from current units rather than guessing a status.
    const units = await db.select({ status: orderUnits.status }).from(orderUnits).where(eq(orderUnits.orderId, id))
    const nextStatus = deriveOrderStatus(units.map((u) => u.status), "draft")
    await db.update(orders).set({ status: nextStatus, updatedAt: Date.now() }).where(eq(orders.id, id))
  }

  revalidatePath(`/admin/orders/${id}`)
  return { id }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getOrders(search?: string) {
  const session = await getStaffSession()
  if (!session) return []

  const base = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      quoteDate: orders.quoteDate,
      createdAt: orders.createdAt,
      customerId: orders.customerId,
      customerName: customers.name,
      firstDevice: sql<string | null>`(select ${orderLines.description} from ${orderLines} where ${orderLines.orderId} = ${orders.id} order by ${orderLines.createdAt} limit 1)`,
      deviceCount: sql<number>`(select count(*) from ${orderLines} where ${orderLines.orderId} = ${orders.id})`,
      totalQuantity: sql<number>`(select coalesce(sum(${orderLines.quantity}), 0) from ${orderLines} where ${orderLines.orderId} = ${orders.id})`,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))

  if (search?.trim()) {
    const q = `%${search.trim()}%`
    return base
      .where(and(isNull(orders.deletedAt), or(like(orders.orderNumber, q), like(customers.name, q))))
      .orderBy(desc(orders.createdAt))
      .limit(100)
  }

  return base.where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt)).limit(100)
}

export async function getOrder(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)))
  if (!order) return null

  const lines = await db
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, id))
    .orderBy(orderLines.createdAt)

  const units = await db
    .select()
    .from(orderUnits)
    .where(eq(orderUnits.orderId, id))
    .orderBy(orderUnits.createdAt)

  return { order, lines, units }
}

export type LinkedRequest = {
  id: string
  requestNumber: string
  status: string
  typeName: string | null
  createdAt: number
  itemCount: number
}

// Reverse traceability: every request that pulled at least one unit from this
// order, with how many of its items came from here.
export async function getRequestsForOrder(orderId: string): Promise<LinkedRequest[]> {
  const session = await getStaffSession()
  if (!session) return []

  const rows = await db
    .select({
      requestId: requests.id,
      requestNumber: requests.requestNumber,
      status: requests.status,
      typeName: requestTypes.nameEn,
      createdAt: requests.createdAt,
    })
    .from(requestItems)
    .innerJoin(orderUnits, eq(requestItems.orderUnitId, orderUnits.id))
    .innerJoin(requests, eq(requestItems.requestId, requests.id))
    .leftJoin(requestTypes, eq(requests.typeId, requestTypes.id))
    .where(and(eq(orderUnits.orderId, orderId), isNull(requests.deletedAt)))
    .orderBy(desc(requests.createdAt))

  const byId = new Map<string, LinkedRequest>()
  for (const r of rows) {
    const existing = byId.get(r.requestId)
    if (existing) {
      existing.itemCount += 1
    } else {
      byId.set(r.requestId, {
        id: r.requestId,
        requestNumber: r.requestNumber,
        status: r.status,
        typeName: r.typeName,
        createdAt: r.createdAt,
        itemCount: 1,
      })
    }
  }
  return [...byId.values()]
}

export async function deleteOrder(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db.update(orders).set({ deletedAt: Date.now() }).where(eq(orders.id, id))

  revalidatePath("/admin/orders")
  return {}
}

// ─── Request import: look up available units by order number ──────────────────

export type AvailableUnit = {
  unitId: string
  serialNumber: string | null
  description: string
  brand: string | null
  model: string | null
  supplierName: string | null
}

export type OrderLookup = {
  orderId: string
  orderNumber: string
  customerId: string
  customerName: string | null
  units: AvailableUnit[]
}

export async function getOrderUnitsByNumber(orderNumber: string): Promise<
  { error?: string; order?: OrderLookup }
> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const trimmed = orderNumber.trim()
  if (!trimmed) return { error: "Order number is required" }

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
      customerName: customers.name,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.orderNumber, trimmed), isNull(orders.deletedAt)))

  if (!order) return { error: "Order not found" }

  // Only "in_stock" units are available to pull into a request.
  const rows = await db
    .select({
      unitId: orderUnits.id,
      serialNumber: orderUnits.serialNumber,
      description: orderLines.description,
      brand: orderLines.brand,
      model: orderLines.model,
      supplierName: suppliers.name,
    })
    .from(orderUnits)
    .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
    .where(and(eq(orderUnits.orderId, order.id), eq(orderUnits.status, "in_stock")))
    .orderBy(orderLines.description)

  return {
    order: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      units: rows,
    },
  }
}
