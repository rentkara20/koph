"use server"

import { and, desc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  customers,
  orderLines,
  orderUnits,
  orders,
  procurementCases,
  purchaseOrderLines,
  purchaseOrders,
  requestItems,
  requests,
  requestTypes,
  sourcingRequests,
  suppliers,
} from "@/lib/db/schema"
import { deriveOrderJourney, type JourneyStage } from "@/lib/domain/order-journey"
import { createId } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import { applyAssetStatusCorrection } from "@/lib/actions/asset-transition"
import { createAssetCore } from "@/lib/actions/assets"
import {
  createOrderSchema,
  firstError,
  orderUnitInputSchema,
  updateOrderSchema,
} from "@/lib/validation/schemas"
import { deriveOrderStatus } from "@/lib/utils/order-status"
import { statusAfterCustomerConfirmation } from "@/lib/domain/order-confirmation"
import { z } from "zod"

export type ActionResult = { error?: string; id?: string }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const confirmCustomerApprovalSchema = z.object({
  orderId: z.string().trim().min(1).max(60),
  confirmationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// Best-effort informational line total (not billed in v1).
function computeLineTotal(quantity: number, unitPriceMonthly?: number, rentalMonths?: number) {
  if (unitPriceMonthly == null) return null
  const months = rentalMonths && rentalMonths > 0 ? rentalMonths : 1
  return quantity * unitPriceMonthly * months
}

// ─── Create ──────────────────────────────────────────────────────────────────

// Tx-scoped create, reused by the "use server" wrapper below AND the CSV
// Import/Export Center. Throws on invalid input (mirrors createAssetCore's
// throw-in-Core / catch-in-wrapper convention). Input must already be parsed
// by createOrderSchema — Core does not re-run zod so CSV callers can build
// their own already-validated row shape.
export async function createOrderCore(
  tx: Tx,
  d: z.infer<typeof createOrderSchema>,
  actorUserId: string | null
): Promise<{ id: string }> {
  // Enforce unique order number (friendly message instead of a DB constraint throw).
  const existing = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.orderNumber, d.orderNumber), isNull(orders.deletedAt)))
  if (existing.length > 0) throw new Error("Order number already exists")

  const id = createId()
  const lineTotals = d.lines.map((l) =>
    computeLineTotal(l.quantity, l.unitPriceMonthly, l.rentalMonths)
  )
  const total = lineTotals.reduce<number | null>((acc, lt) => {
    if (lt == null) return acc
    return (acc ?? 0) + lt
  }, null)

  await tx.insert(orders).values({
    id,
    orderNumber: d.orderNumber,
    customerId: d.customerId,
    contactPerson: d.contactPerson || null,
    contactMobile: d.contactMobile || null,
    contactEmail: d.contactEmail || null,
    quoteDate: d.quoteDate ? new Date(d.quoteDate).getTime() : null,
    customerConfirmedAt: d.customerConfirmationDate
      ? new Date(d.customerConfirmationDate).getTime()
      : null,
    rentalPeriodMonths: d.rentalPeriodMonths ?? null,
    additionalPeriodMonths: d.additionalPeriodMonths ?? null,
    total,
    status: statusAfterCustomerConfirmation("draft", d.customerConfirmationDate),
    notes: d.notes || null,
    createdBy: actorUserId,
  })

  if (d.lines.length > 0) {
    await tx.insert(orderLines).values(
      d.lines.map((l, i) => ({
        id: createId(),
        orderId: id,
        type: l.type,
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

  return { id }
}

export async function createOrder(
  data: z.infer<typeof createOrderSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createOrderSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }
  const d = parsed.data

  // Header + lines are one atomic unit — a mid-create failure must not leave
  // an order header persisted with none (or half) of its lines.
  let id = ""
  try {
    await db.transaction(async (tx) => {
      const result = await createOrderCore(tx, d, session.user.id)
      id = result.id
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create order" }
  }

  revalidatePath("/admin/orders")
  return { id }
}

// Dedicated commercial go-ahead used by the Order overview. Confirmation is
// intentionally separate from the general edit form: it records the date and
// advances a draft into the sourcing/buying journey in one atomic write.
export async function confirmOrderCustomerApproval(
  orderId: string,
  confirmationDate: string
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = confirmCustomerApprovalSchema.safeParse({ orderId, confirmationDate })
  if (!parsed.success) return { error: "Invalid confirmation date" }

  const [order] = await db
    .select({ status: orders.status, customerConfirmedAt: orders.customerConfirmedAt })
    .from(orders)
    .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)))
  if (!order) return { error: "Order not found" }
  if (order.status === "cancelled") return { error: "A cancelled order cannot be confirmed" }
  if (order.customerConfirmedAt) return { id: parsed.data.orderId }

  const confirmedAt = new Date(`${parsed.data.confirmationDate}T00:00:00`).getTime()
  if (!Number.isFinite(confirmedAt)) return { error: "Invalid confirmation date" }

  await db
    .update(orders)
    .set({
      customerConfirmedAt: confirmedAt,
      status: statusAfterCustomerConfirmation(order.status, parsed.data.confirmationDate),
      updatedAt: Date.now(),
    })
    .where(eq(orders.id, parsed.data.orderId))

  revalidatePath(`/admin/orders/${parsed.data.orderId}`)
  revalidatePath("/admin/dashboard")
  return { id: parsed.data.orderId }
}

// ─── Update header + lines (replace strategy) ─────────────────────────────────

// Tx-scoped update, reused by the "use server" wrapper below AND the CSV
// Import/Export Center. Throws on invalid input (mirrors createAssetCore's
// throw-in-Core / catch-in-wrapper convention). Input must already be parsed
// by updateOrderSchema.
export async function updateOrderCore(
  tx: Tx,
  id: string,
  d: z.infer<typeof updateOrderSchema>
): Promise<{ id: string }> {
  const dupe = await tx
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.orderNumber, d.orderNumber), isNull(orders.deletedAt)))
  if (dupe.some((row) => row.id !== id)) throw new Error("Order number already exists")

  // Status is derived from unit fulfillment, not editable from this form —
  // preserve whatever is currently stored (cancel/reopen use their own action).
  const [current] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, id))
  const status = statusAfterCustomerConfirmation(
    current?.status ?? "draft",
    d.customerConfirmationDate
  )

  const lineTotals = d.lines.map((l) =>
    computeLineTotal(l.quantity, l.unitPriceMonthly, l.rentalMonths)
  )
  const total = lineTotals.reduce<number | null>((acc, lt) => {
    if (lt == null) return acc
    return (acc ?? 0) + lt
  }, null)

  // Reconcile lines: update kept, insert new, delete removed. FK cascade is NOT
  // enforced at runtime (no PRAGMA foreign_keys), so unit cleanup is explicit.
  const existingLines = await tx
    .select({ id: orderLines.id })
    .from(orderLines)
    .where(eq(orderLines.orderId, id))
  const existingIds = new Set(existingLines.map((l) => l.id))
  const keptIds = new Set(d.lines.map((l) => l.id).filter((v): v is string => Boolean(v)))

  const toDelete = [...existingIds].filter((lid) => !keptIds.has(lid))
  if (toDelete.length > 0) {
    // Refuse to drop a line whose devices are already committed to a request —
    // deleting them would orphan request history. Only in_stock units are removable.
    const committed = await tx
      .select({ id: orderUnits.id })
      .from(orderUnits)
      .where(and(inArray(orderUnits.orderLineId, toDelete), ne(orderUnits.status, "in_stock")))
    if (committed.length > 0) {
      throw new Error("Cannot remove an item whose devices are already assigned to a request")
    }
  }

  await tx
    .update(orders)
    .set({
      orderNumber: d.orderNumber,
      customerId: d.customerId,
      contactPerson: d.contactPerson || null,
      contactMobile: d.contactMobile || null,
      contactEmail: d.contactEmail || null,
      quoteDate: d.quoteDate ? new Date(d.quoteDate).getTime() : null,
      customerConfirmedAt: d.customerConfirmationDate
        ? new Date(d.customerConfirmationDate).getTime()
        : null,
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
          type: l.type,
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
        type: l.type,
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

  return { id }
}

export async function updateOrder(
  id: string,
  data: z.infer<typeof updateOrderSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = updateOrderSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }
  const d = parsed.data

  // All writes are atomic: a mid-reconcile failure must not leave the order
  // header updated with half of its lines saved.
  try {
    await db.transaction(async (tx) => {
      await updateOrderCore(tx, id, d)
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update order" }
  }

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

  // Duplicate serials (within this submission or against any existing unit)
  // hit the order_unit_serial_idx unique index and would surface as an opaque
  // 500 — pre-check so the user gets the offending serial back instead.
  const submittedSerials = d.units
    .map((u) => u.serialNumber?.trim().toLowerCase())
    .filter((s): s is string => Boolean(s))
  const dupInSubmission = submittedSerials.find((s, i) => submittedSerials.indexOf(s) !== i)
  if (dupInSubmission) return { error: `Serial number already exists: ${dupInSubmission}` }
  if (submittedSerials.length > 0) {
    const clash = await db
      .select({ id: orderUnits.id, serialNumber: orderUnits.serialNumber })
      .from(orderUnits)
      .where(
        inArray(sql`lower(trim(${orderUnits.serialNumber}))`, submittedSerials),
      )
    const kept = new Set(d.units.map((u) => u.id).filter(Boolean))
    const conflict = clash.find((c) => !kept.has(c.id))
    if (conflict) return { error: `Serial number already exists: ${conflict.serialNumber}` }
  }

  // Atomic reconcile: a mid-loop failure must not leave units half-saved.
  try {
  await db.transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.delete(orderUnits).where(inArray(orderUnits.id, toDelete))
    }

    // New units are always inserted as in_stock, then moved to any requested
    // non-default status through the OI-1 chokepoint — so a brand-new unit can
    // never be created directly in assigned/delivered/etc. with no asset_event
    // and no currentRequestId/currentCustomerId linkage.
    const pendingInsertCorrections: { id: string; status: NonNullable<(typeof d.units)[number]["status"]> }[] = []
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
        const { assetId: newId } = await createAssetCore(tx, {
          orderLineId: u.orderLineId,
          serialNumber: u.serialNumber || undefined,
          supplierId: u.supplierId || undefined,
          purchaseCost: u.purchaseCost ?? undefined,
          notes: u.notes || undefined,
        }, session.user.id)
        const desired = u.status ?? "in_stock"
        if (desired !== "in_stock") pendingInsertCorrections.push({ id: newId, status: desired })
      }
    }
    for (const pc of pendingInsertCorrections) {
      await applyAssetStatusCorrection(tx, pc.id, pc.status, { byUserId: session.user.id })
    }

    // Recompute order.status from the units' final fulfillment state INSIDE the
    // same transaction — otherwise a crash between the unit commit and the
    // status write leaves orders.status permanently disagreeing with its units.
    const [orderRow] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId))
    const finalUnits = await tx.select({ status: orderUnits.status }).from(orderUnits).where(eq(orderUnits.orderId, orderId))
    const nextStatus = deriveOrderStatus(
      finalUnits.map((u) => u.status),
      orderRow?.status ?? "draft"
    )
    if (nextStatus !== orderRow?.status) {
      await tx.update(orders).set({ status: nextStatus, updatedAt: Date.now() }).where(eq(orders.id, orderId))
    }
  })
  } catch (error) {
    // TOCTOU backstop for the pre-check above: a concurrent insert can still
    // trip the unique serial index inside the transaction.
    if (error instanceof Error && /UNIQUE.*order_unit_serial/i.test(error.message)) {
      return { error: "Serial number already exists" }
    }
    throw error
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
      customerConfirmedAt: orders.customerConfirmedAt,
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

// ─── Focused option lookups for the customer-scoped order picker ──────────────
// Minimal {id, orderNumber, customerId} projections for async SearchableSelect.
// Search is ALWAYS scoped to one customer, so orders of other customers can
// never appear. Auth-guarded; bounded result set.

export type CustomerOrderOption = { id: string; orderNumber: string; customerId: string }

type Database = typeof db

const ORDER_OPTION_LIMIT = 20

// Core query, db-injectable so it is unit-testable against a fresh test db.
export async function searchCustomerOrdersCore(
  database: Database,
  customerId: string,
  query?: string,
  limit = ORDER_OPTION_LIMIT
): Promise<CustomerOrderOption[]> {
  if (!customerId?.trim()) return []

  const projection = {
    id: orders.id,
    orderNumber: orders.orderNumber,
    customerId: orders.customerId,
  }
  const conditions = [isNull(orders.deletedAt), eq(orders.customerId, customerId)]
  const q = query?.trim()
  if (q) conditions.push(like(orders.orderNumber, `%${q}%`))

  return database
    .select(projection)
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
}

export async function getOrderByIdCore(
  database: Database,
  id: string
): Promise<CustomerOrderOption | null> {
  const [order] = await database
    .select({ id: orders.id, orderNumber: orders.orderNumber, customerId: orders.customerId })
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)))
  return order ?? null
}

export async function searchCustomerOrders(
  customerId: string,
  query?: string
): Promise<CustomerOrderOption[]> {
  const session = await getStaffSession()
  if (!session) return []
  return searchCustomerOrdersCore(db, customerId, query)
}

export async function getOrderById(id: string): Promise<CustomerOrderOption | null> {
  const session = await getStaffSession()
  if (!session) return null
  return getOrderByIdCore(db, id)
}

// Prefill payload for the sourcing form: one draft per order line so the user
// does not retype what the customer order already captured. Kept intentionally
// lean — the form fills its remaining fields (supplier spec, "same as") itself.
export type SourcingItemDraft = {
  quantity: number
  customerDescription: string
  partNumber: string
  notes: string
}

// Compose the human-facing line description from the structured fields, without
// duplicating brand/model text that the free-text description may already hold.
function composeLineDescription(line: {
  description: string
  brand: string | null
  model: string | null
}): string {
  const base = line.description.trim()
  const extras = [line.brand, line.model]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v) && !base.toLowerCase().includes(v!.toLowerCase()))
  return extras.length ? `${base} — ${extras.join(" ")}`.trim() : base
}

export async function getOrderLineDraftsForSourcing(orderId: string): Promise<SourcingItemDraft[]> {
  const session = await getStaffSession()
  if (!session) return []
  if (!orderId?.trim()) return []

  const lines = await db
    .select({
      description: orderLines.description,
      brand: orderLines.brand,
      model: orderLines.model,
      quantity: orderLines.quantity,
      notes: orderLines.notes,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .where(and(eq(orderLines.orderId, orderId), isNull(orders.deletedAt)))
    .orderBy(orderLines.createdAt)

  return lines.map((line) => ({
    quantity: line.quantity,
    customerDescription: composeLineDescription(line),
    partNumber: "",
    notes: line.notes?.trim() ?? "",
  }))
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

// Cross-module progress of an order: how far it has travelled through
// Order → Sourcing → Procurement → Assets → Delivery. Read-only aggregation so
// staff (and sales viewing the order) can see where the work reached at a glance.
export async function getOrderJourney(orderId: string): Promise<JourneyStage[] | null> {
  const session = await getStaffSession()
  if (!session) return null

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
  if (!order) return null

  // Sourcing requests raised for this order.
  const sourcing = await db
    .select({ id: sourcingRequests.id, status: sourcingRequests.status })
    .from(sourcingRequests)
    .where(eq(sourcingRequests.orderId, orderId))
  const sourcingIds = sourcing.map((s) => s.id)

  // Procurement cases + purchase orders descend from those sourcing requests.
  const cases = sourcingIds.length
    ? await db
        .select({ id: procurementCases.id })
        .from(procurementCases)
        .where(inArray(procurementCases.sourcingRequestId, sourcingIds))
    : []
  const caseIds = cases.map((c) => c.id)
  const pos = caseIds.length
    ? await db
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.procurementCaseId, caseIds))
    : []

  // Asset units registered against the order + how many have been delivered.
  const unitRows = await db
    .select({ status: orderUnits.status })
    .from(orderUnits)
    .where(eq(orderUnits.orderId, orderId))

  // Delivery requests that pulled units from this order.
  const linkedRequests = await getRequestsForOrder(orderId)

  return deriveOrderJourney({
    sourcing: {
      requestCount: sourcing.length,
      anyHandedOff: sourcing.some((s) => s.status === "handed_off"),
    },
    procurement: { caseCount: cases.length, poCount: pos.length },
    assets: {
      unitCount: unitRows.length,
      deliveredCount: unitRows.filter((u) => u.status === "delivered").length,
    },
    delivery: {
      requestCount: linkedRequests.length,
      anyCompleted: linkedRequests.some((r) => r.status === "completed"),
    },
  })
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

export async function getAvailableOrderUnitsCore(tx: Tx, orderId: string) {
  const [directUnits, purchasedUnits, freeStockUnits] = await Promise.all([
    tx
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
      .where(and(eq(orderUnits.orderId, orderId), eq(orderUnits.status, "in_stock"))),
    tx
      .select({
        unitId: orderUnits.id,
        serialNumber: orderUnits.serialNumber,
        description: purchaseOrderLines.itemDescription,
        brand: purchaseOrderLines.brand,
        model: purchaseOrderLines.model,
        supplierName: suppliers.name,
      })
      .from(orderUnits)
      .innerJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
      .innerJoin(procurementCases, eq(purchaseOrders.procurementCaseId, procurementCases.id))
      .innerJoin(sourcingRequests, eq(procurementCases.sourcingRequestId, sourcingRequests.id))
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(eq(sourcingRequests.orderId, orderId), eq(orderUnits.status, "in_stock"))),
    // Free stock: units received against a PO whose procurement chain does not
    // resolve to ANY customer order (manual POs / order-less sourcing). These
    // are unallocated inventory, so any order may draw from them. Units whose
    // chain resolves to a different order are excluded (orderId non-null there).
    tx
      .select({
        unitId: orderUnits.id,
        serialNumber: orderUnits.serialNumber,
        description: purchaseOrderLines.itemDescription,
        brand: purchaseOrderLines.brand,
        model: purchaseOrderLines.model,
        supplierName: suppliers.name,
      })
      .from(orderUnits)
      .innerJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
      .innerJoin(procurementCases, eq(purchaseOrders.procurementCaseId, procurementCases.id))
      .leftJoin(sourcingRequests, eq(procurementCases.sourcingRequestId, sourcingRequests.id))
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(
        and(
          eq(orderUnits.status, "in_stock"),
          or(isNull(procurementCases.sourcingRequestId), isNull(sourcingRequests.orderId)),
        ),
      ),
  ])

  const byId = new Map(freeStockUnits.map((unit) => [unit.unitId, unit]))
  for (const unit of directUnits) byId.set(unit.unitId, unit)
  for (const unit of purchasedUnits) byId.set(unit.unitId, unit)
  return [...byId.values()].sort((a, b) => a.description.localeCompare(b.description))
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

  // Both directly-created units and units received through this order's
  // sourcing/procurement chain are available to the delivery request.
  const rows = await db.transaction((tx) => getAvailableOrderUnitsCore(tx, order.id))

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
