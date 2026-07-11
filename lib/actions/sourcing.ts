"use server"

// Sourcing (Milestone 4.5 / Sourcing V2). A Sourcing Request captures a Need —
// anchored to the original customer request number (externalRef: Notion today,
// Odoo later) — and carries one row per requested product
// (sourcing_request_item, three description tiers). It is the root of the
// commercial chain: Sourcing Request → RFQ (any item subset, any supplier,
// repeatable) → Quotation → Evaluation → Approval → Procurement Case
// (lib/actions/commercial-approval.ts, lib/actions/procurement-case.ts).
// No delete action is exposed on any row here — only status transitions.
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  sourcingRequests,
  sourcingRequestItems,
  supplierRfqs,
  supplierRfqItems,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { canIncludeItemInRfq, type SourcingItemStatus } from "@/lib/domain/sourcing-item-status"

type ActionResult = { error?: string; id?: string }

// ─── Create sourcing request ─────────────────────────────────────────────────

const sourcingItemSchema = z.object({
  quantity: z.number().int().min(1).max(10000),
  customerDescription: z.string().trim().min(1).max(2000),
  supplierDescription: z.string().trim().min(1).max(2000),
  partNumber: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
})

const createSourcingRequestSchema = z.object({
  sourceType: z.enum(["customer_order", "stock_replenishment", "operational_need"]),
  orderId: z.string().trim().min(1).optional(),
  orderLineId: z.string().trim().min(1).optional(),
  externalRef: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(500),
  notes: z.string().trim().min(1).max(2000).optional(),
  items: z.array(sourcingItemSchema).min(1).max(100),
})

export async function createSourcingRequest(
  input: z.infer<typeof createSourcingRequestSchema>
): Promise<ActionResult> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const parsed = createSourcingRequestSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data
  if (d.sourceType !== "customer_order" && (d.orderId || d.orderLineId)) {
    return { error: "orderId/orderLineId only apply to sourceType=customer_order" }
  }

  const id = createId()
  await db.transaction(async (tx) => {
    await tx.insert(sourcingRequests).values({
      id,
      sourceType: d.sourceType,
      orderId: d.orderId ?? null,
      orderLineId: d.orderLineId ?? null,
      externalRef: d.externalRef ?? null,
      title: d.title,
      // Legacy NOT NULL column — pre-V2 rows used it as the single spec.
      // V2 keeps it as the free-form note (falls back to the title).
      description: d.notes ?? d.title,
      createdBy: session.user.id,
    })
    for (const item of d.items) {
      await tx.insert(sourcingRequestItems).values({
        id: createId(),
        sourcingRequestId: id,
        quantity: item.quantity,
        customerDescription: item.customerDescription,
        supplierDescription: item.supplierDescription,
        partNumber: item.partNumber ?? null,
        notes: item.notes ?? null,
      })
    }
    await emitDomainEvent(tx, {
      aggregateType: "sourcing_request",
      aggregateId: id,
      eventType: "SourcingRequestCreated",
      payload: {
        sourceType: d.sourceType,
        orderId: d.orderId ?? null,
        externalRef: d.externalRef ?? null,
        itemCount: d.items.length,
      },
      dedupeKey: `sourcing_request:${id}:SourcingRequestCreated`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath("/admin/sourcing")
  return { id }
}

// ─── Add items to an existing request ────────────────────────────────────────

const addItemsSchema = z.object({
  sourcingRequestId: z.string().trim().min(1),
  items: z.array(sourcingItemSchema).min(1).max(100),
})

export async function addSourcingRequestItems(
  input: z.infer<typeof addItemsSchema>
): Promise<ActionResult> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const parsed = addItemsSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  try {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .select({ status: sourcingRequests.status })
        .from(sourcingRequests)
        .where(eq(sourcingRequests.id, d.sourcingRequestId))
      if (!request) throw new Error("Sourcing request not found")
      if (["cancelled", "closed", "handed_off"].includes(request.status)) {
        throw new Error("Request is closed")
      }

      for (const item of d.items) {
        const itemId = createId()
        await tx.insert(sourcingRequestItems).values({
          id: itemId,
          sourcingRequestId: d.sourcingRequestId,
          quantity: item.quantity,
          customerDescription: item.customerDescription,
          supplierDescription: item.supplierDescription,
          partNumber: item.partNumber ?? null,
          notes: item.notes ?? null,
        })
        await emitDomainEvent(tx, {
          aggregateType: "sourcing_request",
          aggregateId: d.sourcingRequestId,
          eventType: "SourcingRequestItemAdded",
          payload: { itemId, quantity: item.quantity },
          dedupeKey: `sourcing_request_item:${itemId}:SourcingRequestItemAdded`,
          actorUserId: session.user.id,
        })
      }
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add items" }
  }

  revalidatePath(`/admin/sourcing/${d.sourcingRequestId}`)
  return { id: d.sourcingRequestId }
}

// ─── Send RFQs to suppliers (item subset × suppliers) ────────────────────────
// One RFQ row per supplier, each carrying the selected item subset via
// supplier_rfq_item. Deliberately NO uniqueness on (request, supplier): a
// second RFQ to the same supplier is a revision/addition and both stay
// visible as history. FK PRAGMA is off — item∈request enforced here.

const sendRfqsSchema = z.object({
  sourcingRequestId: z.string().trim().min(1),
  supplierIds: z.array(z.string().trim().min(1)).min(1),
  itemIds: z.array(z.string().trim().min(1)).min(1),
})

export async function sendSupplierRfqs(input: z.infer<typeof sendRfqsSchema>): Promise<ActionResult> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const parsed = sendRfqsSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data
  const uniqueItemIds = [...new Set(d.itemIds)]
  const uniqueSupplierIds = [...new Set(d.supplierIds)]

  try {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .select({ status: sourcingRequests.status })
        .from(sourcingRequests)
        .where(eq(sourcingRequests.id, d.sourcingRequestId))
      if (!request) throw new Error("Sourcing request not found")
      if (["cancelled", "closed"].includes(request.status)) {
        throw new Error("Request is closed")
      }

      // Integrity guard: every selected item must belong to this request and
      // be in a sourceable status.
      const items = await tx
        .select({ id: sourcingRequestItems.id, status: sourcingRequestItems.status })
        .from(sourcingRequestItems)
        .where(
          and(
            eq(sourcingRequestItems.sourcingRequestId, d.sourcingRequestId),
            inArray(sourcingRequestItems.id, uniqueItemIds)
          )
        )
      if (items.length !== uniqueItemIds.length) {
        throw new Error("One or more items do not belong to this request")
      }
      const blocked = items.filter((i) => !canIncludeItemInRfq(i.status as SourcingItemStatus))
      if (blocked.length > 0) throw new Error("One or more items are cancelled")

      const supplierRows = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(inArray(suppliers.id, uniqueSupplierIds))
      if (supplierRows.length !== uniqueSupplierIds.length) {
        throw new Error("One or more suppliers not found")
      }

      for (const supplierId of uniqueSupplierIds) {
        const rfqId = createId()
        await tx.insert(supplierRfqs).values({
          id: rfqId,
          sourcingRequestId: d.sourcingRequestId,
          supplierId,
        })
        for (const itemId of uniqueItemIds) {
          await tx.insert(supplierRfqItems).values({
            id: createId(),
            rfqId,
            sourcingRequestItemId: itemId,
          })
        }
        await emitDomainEvent(tx, {
          aggregateType: "supplier_rfq",
          aggregateId: rfqId,
          eventType: "SupplierRfqSent",
          payload: { sourcingRequestId: d.sourcingRequestId, supplierId, itemIds: uniqueItemIds },
          dedupeKey: `supplier_rfq:${rfqId}:SupplierRfqSent`,
          actorUserId: session.user.id,
        })
      }

      // Derived statuses: pending items included in an RFQ move to rfq_sent.
      await tx
        .update(sourcingRequestItems)
        .set({ status: "rfq_sent", updatedAt: Date.now() })
        .where(
          and(
            inArray(sourcingRequestItems.id, uniqueItemIds),
            eq(sourcingRequestItems.status, "pending")
          )
        )
      if (request.status === "draft") {
        await tx
          .update(sourcingRequests)
          .set({ status: "rfq_sent", updatedAt: Date.now() })
          .where(eq(sourcingRequests.id, d.sourcingRequestId))
      }
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send RFQs" }
  }

  revalidatePath(`/admin/sourcing/${d.sourcingRequestId}`)
  return { id: d.sourcingRequestId }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getSourcingRequests() {
  const session = await getStaffSession()
  if (!session) return []
  return db.select().from(sourcingRequests).orderBy(desc(sourcingRequests.createdAt)).limit(200)
}

export async function getSourcingRequest(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [request] = await db.select().from(sourcingRequests).where(eq(sourcingRequests.id, id))
  if (!request) return null

  const items = await db
    .select()
    .from(sourcingRequestItems)
    .where(eq(sourcingRequestItems.sourcingRequestId, id))
    .orderBy(sourcingRequestItems.createdAt)

  const rfqs = await db
    .select({
      id: supplierRfqs.id,
      supplierId: supplierRfqs.supplierId,
      supplierName: suppliers.name,
      supplierContactPerson: suppliers.contactPerson,
      supplierMobile: suppliers.mobile,
      supplierEmail: suppliers.email,
      status: supplierRfqs.status,
      sentAt: supplierRfqs.sentAt,
    })
    .from(supplierRfqs)
    .innerJoin(suppliers, eq(supplierRfqs.supplierId, suppliers.id))
    .where(and(eq(supplierRfqs.sourcingRequestId, id)))
    .orderBy(desc(supplierRfqs.sentAt))

  const rfqItemRows = rfqs.length
    ? await db
        .select({
          rfqId: supplierRfqItems.rfqId,
          sourcingRequestItemId: supplierRfqItems.sourcingRequestItemId,
        })
        .from(supplierRfqItems)
        .where(
          inArray(
            supplierRfqItems.rfqId,
            rfqs.map((r) => r.id)
          )
        )
    : []
  const rfqItemIds: Record<string, string[]> = {}
  for (const row of rfqItemRows) {
    rfqItemIds[row.rfqId] = [...(rfqItemIds[row.rfqId] ?? []), row.sourcingRequestItemId]
  }

  return { request, items, rfqs, rfqItemIds }
}
