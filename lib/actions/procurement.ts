"use server"

// Procurement (Milestone 3 / P4). Purchase orders/lines are a distinct layer
// from the client "order"/"order_line" tables — receiving a line creates an
// Asset via the same createAssetCore chokepoint used by the existing
// minimal-entry flow (lib/actions/assets.ts), just with a purchaseOrderLineId
// origin instead of orderLineId. Existing client order-line asset creation
// stays untouched and fully compatible.
import { and, desc, eq, lt, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  commercialApprovals,
  commercialEvaluations,
  orderUnits,
  procurementCases,
  purchaseOrderLines,
  purchaseOrders,
  supplierQuotationLines,
  supplierQuotations,
  supplierRfqs,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { createAssetCore } from "@/lib/actions/assets"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { createProcurementCaseCore } from "@/lib/actions/procurement-case"

type ActionResult = { error?: string; id?: string }

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPurchaseOrders() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      supplierName: suppliers.name,
      invoiceRef: purchaseOrders.invoiceRef,
      orderedAt: purchaseOrders.orderedAt,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(200)
}

export async function getPurchaseOrder(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      invoiceRef: purchaseOrders.invoiceRef,
      orderedAt: purchaseOrders.orderedAt,
      notes: purchaseOrders.notes,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      procurementCaseId: purchaseOrders.procurementCaseId,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.id, id))
  if (!po) return null

  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, id))
    .orderBy(purchaseOrderLines.createdAt)

  return { po, lines }
}

// Assets received against a specific PO line — for the receiving UI list.
export async function getReceivedUnitsForLine(purchaseOrderLineId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      createdAt: orderUnits.createdAt,
    })
    .from(orderUnits)
    .where(eq(orderUnits.purchaseOrderLineId, purchaseOrderLineId))
    .orderBy(desc(orderUnits.createdAt))
}

// ─── Create purchase order ───────────────────────────────────────────────────

const createPoSchema = z.object({
  supplierId: z.string().trim().min(1),
  poNumber: z.string().trim().min(1).max(60),
  invoiceRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        itemDescription: z.string().trim().min(1).max(300),
        brand: z.string().trim().max(120).optional(),
        model: z.string().trim().max(120).optional(),
        requiresSerial: z.boolean().default(true),
        qtyOrdered: z.number().int().min(1),
        unitCost: z.number().min(0).optional(),
      })
    )
    .min(1),
})

export async function createPurchaseOrder(
  input: z.infer<typeof createPoSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = createPoSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const [clash] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.poNumber, d.poNumber))
  if (clash) return { error: "PO number already exists" }

  let poId = ""
  await db.transaction(async (tx) => {
    // Every purchase order belongs to exactly one procurement case (M4.5 —
    // single operational anchor). Manual creation here never goes through the
    // commercial flow, so it auto-creates a system_manual case in the same
    // transaction — there is never a PO without an anchor, never a second
    // procurement workflow.
    const { caseId } = await createProcurementCaseCore(tx, { source: "system_manual" }, session.user.id)

    poId = createId()
    await tx.insert(purchaseOrders).values({
      id: poId,
      supplierId: d.supplierId,
      poNumber: d.poNumber,
      status: "ordered",
      invoiceRef: d.invoiceRef,
      orderedAt: Date.now(),
      notes: d.notes,
      procurementCaseId: caseId,
      createdBy: session.user.id,
    })
    for (const line of d.lines) {
      await tx.insert(purchaseOrderLines).values({
        id: createId(),
        purchaseOrderId: poId,
        itemDescription: line.itemDescription,
        brand: line.brand,
        model: line.model,
        requiresSerial: line.requiresSerial,
        qtyOrdered: line.qtyOrdered,
        unitCost: line.unitCost,
      })
    }
    await emitDomainEvent(tx, {
      aggregateType: "purchase_order",
      aggregateId: poId,
      eventType: "PurchaseOrderCreated",
      payload: { poNumber: d.poNumber, supplierId: d.supplierId, lineCount: d.lines.length },
      dedupeKey: `purchase_order:${poId}:PurchaseOrderCreated`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath("/admin/procurement")
  return { id: poId }
}

// ─── Create a purchase order FROM an already-linked commercial-flow case ────
// Closes the gap between "Procurement Case -> external ERP PO" and
// "Receiving": once a case's ERP-PO link is set, this mints the local
// purchase_order/lines that receivePurchaseOrderLineCore works against —
// supplier and lines are derived from the case's chosen quotation, not
// re-entered, so the commercial numbers ops already agreed to stay the
// source of truth.

const createPoFromCaseSchema = z.object({
  procurementCaseId: z.string().trim().min(1),
  poNumber: z.string().trim().min(1).max(60),
  invoiceRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export async function createPurchaseOrderFromCase(
  input: z.infer<typeof createPoFromCaseSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = createPoFromCaseSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const [procurementCase] = await db.select().from(procurementCases).where(eq(procurementCases.id, d.procurementCaseId))
  if (!procurementCase) return { error: "Procurement case not found" }
  if (procurementCase.source !== "commercial_flow") {
    return { error: "Only commercial-flow cases create a PO this way — manual POs already have one" }
  }
  if (!procurementCase.externalPoRef) {
    return { error: "Link the external ERP PO before creating the purchase order" }
  }
  if (procurementCase.status === "superseded") return { error: "Procurement case is superseded" }

  const [existingPo] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.procurementCaseId, d.procurementCaseId))
  if (existingPo) return { error: "A purchase order already exists for this case" }

  if (!procurementCase.commercialApprovalId) return { error: "Case has no commercial approval on record" }
  const [approval] = await db
    .select()
    .from(commercialApprovals)
    .where(eq(commercialApprovals.id, procurementCase.commercialApprovalId))
  if (!approval) return { error: "Commercial approval not found" }

  const [evaluation] = await db
    .select()
    .from(commercialEvaluations)
    .where(eq(commercialEvaluations.id, approval.evaluationId))
  if (!evaluation?.chosenQuotationId) return { error: "Evaluation has no chosen quotation on record" }

  const [quotation] = await db
    .select()
    .from(supplierQuotations)
    .where(eq(supplierQuotations.id, evaluation.chosenQuotationId))
  if (!quotation) return { error: "Chosen quotation not found" }

  const [rfq] = await db.select().from(supplierRfqs).where(eq(supplierRfqs.id, quotation.rfqId))
  if (!rfq) return { error: "RFQ for chosen quotation not found" }

  const lines = await db
    .select()
    .from(supplierQuotationLines)
    .where(eq(supplierQuotationLines.quotationId, quotation.id))
  if (lines.length === 0) return { error: "Chosen quotation has no lines" }

  const [clash] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.poNumber, d.poNumber))
  if (clash) return { error: "PO number already exists" }

  let poId = ""
  await db.transaction(async (tx) => {
    poId = createId()
    await tx.insert(purchaseOrders).values({
      id: poId,
      supplierId: rfq.supplierId,
      poNumber: d.poNumber,
      status: "ordered",
      invoiceRef: d.invoiceRef,
      orderedAt: Date.now(),
      notes: d.notes,
      procurementCaseId: d.procurementCaseId,
      createdBy: session.user.id,
    })
    for (const line of lines) {
      await tx.insert(purchaseOrderLines).values({
        id: createId(),
        purchaseOrderId: poId,
        itemDescription: line.itemDescription,
        qtyOrdered: line.qty,
        unitCost: line.unitPrice,
      })
    }
    await emitDomainEvent(tx, {
      aggregateType: "purchase_order",
      aggregateId: poId,
      eventType: "PurchaseOrderCreated",
      payload: { poNumber: d.poNumber, supplierId: rfq.supplierId, procurementCaseId: d.procurementCaseId },
      dedupeKey: `purchase_order:${poId}:PurchaseOrderCreated`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath("/admin/procurement")
  revalidatePath(`/admin/sourcing/${procurementCase.sourcingRequestId}`)
  return { id: poId }
}

// ─── Receive a line into an Asset (atomic) ───────────────────────────────────
// Not a status transition on an existing asset — same rationale as
// createAssetCore in lib/actions/assets.ts. Validates remaining quantity,
// creates the Asset via createAssetCore with a purchaseOrderLineId origin,
// increments qtyReceived, and recomputes the PO's aggregate status — all in
// one transaction.

const receiveLineSchema = z.object({
  purchaseOrderLineId: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1).max(120),
  assetTag: z.string().trim().max(40).optional(),
})

// Exported separately so integration tests can exercise the atomic receiving
// path directly, same rationale as createAssetCore (lib/actions/assets.ts).
export async function receivePurchaseOrderLineCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof receiveLineSchema>,
  actorUserId: string | null
): Promise<{ assetId: string }> {
  const d = receiveLineSchema.parse(input)

  const [line] = await tx
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.id, d.purchaseOrderLineId))
  if (!line) throw new Error("Purchase order line not found")
  if (line.status === "cancelled") throw new Error("Cannot receive a cancelled line")

  // Atomic guarded increment FIRST: two concurrent receives of the same line
  // must not both pass a stale `qtyReceived < qtyOrdered` check and each mint
  // an asset (over-receive). The compare-and-set makes the second one a no-op.
  const incremented = await tx
    .update(purchaseOrderLines)
    .set({ qtyReceived: sql`${purchaseOrderLines.qtyReceived} + 1`, updatedAt: Date.now() })
    .where(and(eq(purchaseOrderLines.id, line.id), lt(purchaseOrderLines.qtyReceived, purchaseOrderLines.qtyOrdered)))
  if (((incremented as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
    throw new Error("Cannot receive more than ordered")
  }
  const newQtyReceived = line.qtyReceived + 1

  const result = await createAssetCore(
    tx,
    { purchaseOrderLineId: line.id, serialNumber: d.serialNumber, assetTag: d.assetTag },
    actorUserId
  )
  const assetId = result.assetId

  await emitDomainEvent(tx, {
    aggregateType: "purchase_order",
    aggregateId: line.purchaseOrderId,
    eventType: "PurchaseOrderLineReceived",
    payload: { purchaseOrderLineId: line.id, assetId, qtyReceived: newQtyReceived },
    dedupeKey: `purchase_order_line:${line.id}:received:${assetId}`,
    actorUserId,
  })

  await recomputePurchaseOrderStatus(tx, line.purchaseOrderId)

  return { assetId }
}

// Recompute a PO's aggregate status from its lines. Cancelled lines are
// excluded — their ordered/received quantities no longer count. A PO whose
// every line is cancelled collapses to "cancelled".
async function recomputePurchaseOrderStatus(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  purchaseOrderId: string
): Promise<void> {
  const activeLines = await tx
    .select({
      qtyOrdered: purchaseOrderLines.qtyOrdered,
      qtyReceived: purchaseOrderLines.qtyReceived,
    })
    .from(purchaseOrderLines)
    .where(
      and(
        eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId),
        eq(purchaseOrderLines.status, "active")
      )
    )

  let newStatus: "ordered" | "partially_received" | "received" | "cancelled"
  if (activeLines.length === 0) {
    newStatus = "cancelled"
  } else {
    const totalOrdered = activeLines.reduce((s, l) => s + l.qtyOrdered, 0)
    const totalReceived = activeLines.reduce((s, l) => s + l.qtyReceived, 0)
    newStatus =
      totalReceived >= totalOrdered ? "received" : totalReceived > 0 ? "partially_received" : "ordered"
  }

  await tx
    .update(purchaseOrders)
    .set({ status: newStatus, updatedAt: Date.now() })
    .where(eq(purchaseOrders.id, purchaseOrderId))
}

// ─── Cancel a purchase order line ────────────────────────────────────────────
// A line is never hard-deleted once created — it is cancelled, keeping the
// audit trail, and only while nothing has been received against it. Cancelling
// recomputes the PO's aggregate status (a fully-cancelled PO becomes cancelled).

const cancelLineSchema = z.object({
  purchaseOrderLineId: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional(),
})

// Exported separately so integration tests can exercise the cancellation +
// status-recompute path directly, same rationale as receivePurchaseOrderLineCore.
export async function cancelPurchaseOrderLineCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof cancelLineSchema>,
  actorUserId: string | null
): Promise<void> {
  const d = cancelLineSchema.parse(input)

  const [line] = await tx
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.id, d.purchaseOrderLineId))
  if (!line) throw new Error("Purchase order line not found")
  if (line.status === "cancelled") throw new Error("Line is already cancelled")
  if (line.qtyReceived > 0) throw new Error("Cannot cancel a line that has received units")

  await tx
    .update(purchaseOrderLines)
    .set({
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelReason: d.reason ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(purchaseOrderLines.id, line.id))

  await emitDomainEvent(tx, {
    aggregateType: "purchase_order",
    aggregateId: line.purchaseOrderId,
    eventType: "PurchaseOrderLineCancelled",
    payload: { purchaseOrderLineId: line.id, reason: d.reason ?? null },
    dedupeKey: `purchase_order_line:${line.id}:cancelled`,
    actorUserId,
  })

  await recomputePurchaseOrderStatus(tx, line.purchaseOrderId)
}

export async function cancelPurchaseOrderLine(
  input: z.infer<typeof cancelLineSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = cancelLineSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  try {
    await db.transaction(async (tx) => {
      await cancelPurchaseOrderLineCore(tx, parsed.data, session.user.id)
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to cancel line" }
  }

  revalidatePath("/admin/procurement")
  return {}
}

export async function receivePurchaseOrderLine(
  input: z.infer<typeof receiveLineSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = receiveLineSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let assetId = ""
  try {
    await db.transaction(async (tx) => {
      const result = await receivePurchaseOrderLineCore(tx, parsed.data, session.user.id)
      assetId = result.assetId
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to receive line" }
  }

  revalidatePath("/admin/procurement")
  revalidatePath("/admin/assets")
  return { id: assetId }
}
