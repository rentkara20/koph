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
  commercialEvaluationLines,
  commercialEvaluations,
  orderUnits,
  orders,
  partnerContracts,
  partnerPayments,
  partnerTasks,
  pickupTaskLines,
  procurementCases,
  purchaseOrderLines,
  purchaseOrders,
  sourcingRequests,
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
import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"
import { computePayment, type PricingModel } from "@/lib/domain/pricing"
import { buildAwardedPurchaseOrderDraft } from "@/lib/domain/purchase-order-draft"

type ActionResult = { error?: string; id?: string }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

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

export async function getLinkedOrderForProcurementCaseCore(tx: Tx, procurementCaseId: string) {
  const [linkedOrder] = await tx
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(procurementCases)
    .innerJoin(sourcingRequests, eq(procurementCases.sourcingRequestId, sourcingRequests.id))
    .innerJoin(orders, eq(sourcingRequests.orderId, orders.id))
    .where(eq(procurementCases.id, procurementCaseId))
  return linkedOrder ?? null
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
      qcRequired: purchaseOrders.qcRequired,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      procurementCaseId: purchaseOrders.procurementCaseId,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.id, id))
  if (!po) return null

  const [lines, linkedOrder] = await Promise.all([
    db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, id))
      .orderBy(purchaseOrderLines.createdAt),
    db.transaction((tx) => getLinkedOrderForProcurementCaseCore(tx, po.procurementCaseId)),
  ])

  return { po, lines, linkedOrder }
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
        kind: z.enum(["rental", "sale"]).default("rental"),
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
        kind: line.kind,
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
  if (!evaluation) return { error: "Commercial evaluation not found" }

  let supplierId = ""
  let lines: { itemDescription: string; qty: number; unitPrice: number | null }[] = []

  // Sourcing V2: an evaluation may award different items to different
  // suppliers. Each procurement case owns one supplier, so mint only that
  // supplier's awarded lines into this PO.
  const awardedLines = await db
    .select({
      supplierId: supplierRfqs.supplierId,
      itemDescription: supplierQuotationLines.itemDescription,
      qty: supplierQuotationLines.qty,
      unitPrice: supplierQuotationLines.unitPrice,
    })
    .from(commercialEvaluationLines)
    .innerJoin(supplierQuotationLines, eq(commercialEvaluationLines.chosenQuotationLineId, supplierQuotationLines.id))
    .innerJoin(supplierQuotations, eq(supplierQuotationLines.quotationId, supplierQuotations.id))
    .innerJoin(supplierRfqs, eq(supplierQuotations.rfqId, supplierRfqs.id))
    .where(eq(commercialEvaluationLines.evaluationId, evaluation.id))

  if (awardedLines.length > 0) {
    if (!procurementCase.supplierId) return { error: "Case has no awarded supplier" }
    try {
      const draft = buildAwardedPurchaseOrderDraft({
        caseSupplierId: procurementCase.supplierId,
        externalPoRef: procurementCase.externalPoRef,
        awardedLines,
      })
      supplierId = draft.supplierId
      lines = draft.lines
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to build purchase order" }
    }
  } else {
    // Legacy evaluations selected one whole quotation instead of per-item
    // awards. Keep that historical path working.
    if (!evaluation.chosenQuotationId) return { error: "Evaluation has no awarded quotation lines" }
    const [quotation] = await db
      .select()
      .from(supplierQuotations)
      .where(eq(supplierQuotations.id, evaluation.chosenQuotationId))
    if (!quotation) return { error: "Chosen quotation not found" }
    const [rfq] = await db.select().from(supplierRfqs).where(eq(supplierRfqs.id, quotation.rfqId))
    if (!rfq) return { error: "RFQ for chosen quotation not found" }
    supplierId = rfq.supplierId
    lines = await db
      .select({
        itemDescription: supplierQuotationLines.itemDescription,
        qty: supplierQuotationLines.qty,
        unitPrice: supplierQuotationLines.unitPrice,
      })
      .from(supplierQuotationLines)
      .where(eq(supplierQuotationLines.quotationId, quotation.id))
    if (lines.length === 0) return { error: "Chosen quotation has no lines" }
  }

  const poNumber = procurementCase.externalPoRef

  const [clash] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.poNumber, poNumber))
  if (clash) return { error: "PO number already exists" }

  let poId = ""
  try {
    await db.transaction(async (tx) => {
      // Re-check inside the tx: the earlier read-only check races two concurrent
      // submissions with different PO numbers (no shared-row write forces a
      // conflict), so the one-PO-per-case invariant must be re-asserted here and
      // is backstopped by the unique index on purchase_order.procurement_case_id.
      const [existingPo] = await tx
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.procurementCaseId, d.procurementCaseId))
      if (existingPo) throw new Error("PO_EXISTS")

      poId = createId()
      await tx.insert(purchaseOrders).values({
        id: poId,
        supplierId,
        poNumber,
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
        payload: { poNumber, supplierId, procurementCaseId: d.procurementCaseId },
        dedupeKey: `purchase_order:${poId}:PurchaseOrderCreated`,
        actorUserId: session.user.id,
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "PO_EXISTS") {
      return { error: "A purchase order already exists for this case" }
    }
    // Unique-index violation on procurement_case_id from a lost race.
    if (error instanceof Error && /procurement_case_id|UNIQUE/i.test(error.message)) {
      return { error: "A purchase order already exists for this case" }
    }
    return { error: error instanceof Error ? error.message : "Failed to create purchase order" }
  }

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
  // Present when the unit arrived via a supplier-pickup task: attributes the
  // receipt to that task's line (qtyReceived ≤ qtyPickedUp) and auto-closes
  // the task once all its lines are fully received.
  pickupTaskId: z.string().trim().min(1).optional(),
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

  // Attribute the receipt to a pickup task when the unit arrived through one:
  // guarded increment against that task line's collected quantity, so the
  // warehouse can never confirm more than the partner picked up.
  if (d.pickupTaskId) {
    const [pickupTask] = await tx
      .select()
      .from(partnerTasks)
      .where(eq(partnerTasks.id, d.pickupTaskId))
    if (!pickupTask || pickupTask.kind !== "supplier_pickup") {
      throw new Error("Pickup task not found")
    }
    if (pickupTask.status !== "picked_up") {
      throw new Error("Pickup task has not collected the goods yet")
    }
    if (pickupTask.purchaseOrderId !== line.purchaseOrderId) {
      throw new Error("Pickup task belongs to a different purchase order")
    }
    const taskLineIncrement = await tx
      .update(pickupTaskLines)
      .set({ qtyReceived: sql`${pickupTaskLines.qtyReceived} + 1`, updatedAt: Date.now() })
      .where(
        and(
          eq(pickupTaskLines.pickupTaskId, d.pickupTaskId),
          eq(pickupTaskLines.purchaseOrderLineId, line.id),
          lt(pickupTaskLines.qtyReceived, pickupTaskLines.qtyPickedUp)
        )
      )
    if (((taskLineIncrement as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
      throw new Error("Cannot receive more than this pickup task collected for this line")
    }
  }

  // QC gate: qcRequired POs mint units at receiving_qc — never straight into
  // available inventory.
  const [po] = await tx
    .select({ qcRequired: purchaseOrders.qcRequired })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, line.purchaseOrderId))

  const result = await createAssetCore(
    tx,
    { purchaseOrderLineId: line.id, serialNumber: d.serialNumber, assetTag: d.assetTag },
    actorUserId,
    po?.qcRequired ? "receiving_qc" : "in_stock",
    // Rental vs product-for-sale is the buyer's intent captured on the PO line.
    (line.kind ?? "rental") as "rental" | "sale"
  )
  const assetId = result.assetId

  await emitDomainEvent(tx, {
    aggregateType: "purchase_order",
    aggregateId: line.purchaseOrderId,
    eventType: "PurchaseOrderLineReceived",
    payload: {
      purchaseOrderLineId: line.id,
      assetId,
      qtyReceived: newQtyReceived,
      pickupTaskId: d.pickupTaskId ?? null,
      qc: Boolean(po?.qcRequired),
    },
    dedupeKey: `purchase_order_line:${line.id}:received:${assetId}`,
    actorUserId,
  })

  if (d.pickupTaskId) {
    await tryClosePickupTaskCore(tx, d.pickupTaskId, actorUserId)
  }

  await recomputePurchaseOrderStatus(tx, line.purchaseOrderId)

  return { assetId }
}

// Auto-close a pickup task once every line's received count matches what the
// partner collected — the warehouse receipt IS the completion of the pickup;
// there is no separate sign-off step to forget. Generates the partner payment
// exactly like a request-task close would.
export async function tryClosePickupTaskCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  pickupTaskId: string,
  actorUserId: string | null
): Promise<{ closed: boolean }> {
  const [task] = await tx.select().from(partnerTasks).where(eq(partnerTasks.id, pickupTaskId))
  if (!task || task.kind !== "supplier_pickup" || task.status !== "picked_up") {
    return { closed: false }
  }

  const taskLines = await tx
    .select()
    .from(pickupTaskLines)
    .where(eq(pickupTaskLines.pickupTaskId, pickupTaskId))
  const allReceived =
    taskLines.length > 0 && taskLines.every((l) => l.qtyReceived >= l.qtyPickedUp)
  if (!allReceived) return { closed: false }

  // Guard on picked_up so two concurrent final receipts can't both close and
  // both mint a payment.
  const result = await tx
    .update(partnerTasks)
    .set({ status: "closed", closedBy: actorUserId, closedAt: Date.now(), updatedAt: Date.now() })
    .where(and(eq(partnerTasks.id, pickupTaskId), eq(partnerTasks.status, "picked_up")))
  if (((result as { rowsAffected?: number }).rowsAffected ?? 0) === 0) return { closed: false }

  const totalCollected = taskLines.reduce((s, l) => s + l.qtyPickedUp, 0)

  await emitDomainEvent(tx, {
    aggregateType: "task",
    aggregateId: pickupTaskId,
    eventType: "PickupTaskClosed",
    payload: { purchaseOrderId: task.purchaseOrderId, quantity: totalCollected },
    dedupeKey: `task:${pickupTaskId}:PickupTaskClosed`,
    actorUserId,
  })

  if (task.contractId) {
    const [contract] = await tx
      .select()
      .from(partnerContracts)
      .where(eq(partnerContracts.id, task.contractId))
    if (contract) {
      const { quantity: finalQty, totalAmount } = computePayment(
        contract.pricingModel as PricingModel,
        contract.unitPrice,
        totalCollected
      )
      const paymentId = createId()
      await tx.insert(partnerPayments).values({
        id: paymentId,
        partnerId: task.partnerId,
        partnerTaskId: task.id,
        pricingModel: contract.pricingModel,
        quantity: finalQty,
        unitPrice: contract.unitPrice,
        totalAmount,
        status: "pending",
      })
      await emitDomainEvent(tx, {
        aggregateType: "partner_payment",
        aggregateId: paymentId,
        eventType: "PartnerPaymentCreated",
        payload: { partnerId: task.partnerId, partnerTaskId: task.id, totalAmount },
        dedupeKey: `partner_payment:${paymentId}:PartnerPaymentCreated`,
        actorUserId,
      })
    }
  }

  return { closed: true }
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

// ─── PO lifecycle milestones (paid / ready for pickup) ───────────────────────
// Payment itself lives in the ERP (Zoho/Odoo) — paidAt only records that ops
// confirmed it. readyForPickupAt is the gate for creating pickup tasks.

export async function markPurchaseOrderPaid(purchaseOrderId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId))
  if (!po) return { error: "Purchase order not found" }
  if (po.status === "cancelled") return { error: "Purchase order is cancelled" }
  if (po.paidAt) return { error: "Purchase order is already marked paid" }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ paidAt: Date.now(), updatedAt: Date.now() })
      .where(eq(purchaseOrders.id, purchaseOrderId))
    await emitDomainEvent(tx, {
      aggregateType: "purchase_order",
      aggregateId: purchaseOrderId,
      eventType: "PurchaseOrderMarkedPaid",
      payload: { poNumber: po.poNumber },
      dedupeKey: `purchase_order:${purchaseOrderId}:PurchaseOrderMarkedPaid`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath(`/admin/procurement/${purchaseOrderId}`)
  return { id: purchaseOrderId }
}

export async function markReadyForPickup(purchaseOrderId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId))
  if (!po) return { error: "Purchase order not found" }
  if (po.status !== "ordered" && po.status !== "partially_received") {
    return { error: "Only an open purchase order can be marked ready for pickup" }
  }
  if (po.readyForPickupAt) return { error: "Purchase order is already ready for pickup" }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ readyForPickupAt: Date.now(), updatedAt: Date.now() })
      .where(eq(purchaseOrders.id, purchaseOrderId))
    await emitDomainEvent(tx, {
      aggregateType: "purchase_order",
      aggregateId: purchaseOrderId,
      eventType: "PurchaseOrderReadyForPickup",
      payload: { poNumber: po.poNumber },
      dedupeKey: `purchase_order:${purchaseOrderId}:PurchaseOrderReadyForPickup`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath(`/admin/procurement/${purchaseOrderId}`)
  return { id: purchaseOrderId }
}

// Toggle whether receiving this PO routes units through the QC gate. Only
// meaningful before/during receiving; already-minted units keep their status.
export async function setPurchaseOrderQcRequired(
  purchaseOrderId: string,
  qcRequired: boolean
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId))
  if (!po) return { error: "Purchase order not found" }
  if (po.status === "cancelled") return { error: "Purchase order is cancelled" }

  await db
    .update(purchaseOrders)
    .set({ qcRequired, updatedAt: Date.now() })
    .where(eq(purchaseOrders.id, purchaseOrderId))

  revalidatePath(`/admin/procurement/${purchaseOrderId}`)
  return { id: purchaseOrderId }
}

// ─── Receiving QC (pass / fail) ───────────────────────────────────────────────
// Thin wrappers over the applyAssetTransition chokepoint: qc_pass moves a
// receiving_qc unit into available inventory, qc_fail marks it damaged.

export async function qcAssetsCore(
  tx: Tx,
  assetIds: string[],
  pass: boolean,
  notes: string | null,
  actorUserId: string | null
): Promise<void> {
  if (assetIds.length === 0) throw new Error("No devices selected")
  const cleanNotes = notes?.trim() ?? ""
  if (!pass && !cleanNotes) throw new Error("QC rejection reason is required")
  if (cleanNotes.length > 500) throw new Error("Notes are too long")

  for (const assetId of assetIds) {
    await applyAssetTransition(tx, assetId, pass ? "qc_pass" : "qc_fail", {
      notes: cleanNotes || null,
      byUserId: actorUserId,
    })
  }
}

export async function qcAsset(assetId: string, pass: boolean, notes?: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  if (notes && notes.length > 500) return { error: "Notes are too long" }

  try {
    await db.transaction(async (tx) => {
      await qcAssetsCore(tx, [assetId], pass, notes ?? null, session.user.id)
    })
  } catch (error) {
    if (error instanceof AssetTransitionError) return { error: error.message }
    return { error: error instanceof Error ? error.message : "QC update failed" }
  }

  revalidatePath("/admin/assets")
  revalidatePath("/admin/procurement")
  return { id: assetId }
}

export async function qcAssets(assetIds: string[], pass: boolean, notes?: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const uniqueIds = [...new Set(assetIds)]
  if (uniqueIds.length > 200) return { error: "Too many devices selected" }

  try {
    await db.transaction((tx) => qcAssetsCore(tx, uniqueIds, pass, notes ?? null, session.user.id))
  } catch (error) {
    if (error instanceof AssetTransitionError) return { error: error.message }
    return { error: error instanceof Error ? error.message : "QC update failed" }
  }

  revalidatePath("/admin/assets")
  revalidatePath("/admin/procurement")
  return { id: uniqueIds[0] }
}

// Units awaiting QC, joined to their PO for the receiving/QC queue UI.
export async function getQcQueue() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      createdAt: orderUnits.createdAt,
      purchaseOrderId: orderUnits.purchaseOrderId,
      poNumber: purchaseOrders.poNumber,
      supplierName: suppliers.name,
    })
    .from(orderUnits)
    .leftJoin(purchaseOrders, eq(orderUnits.purchaseOrderId, purchaseOrders.id))
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(orderUnits.status, "receiving_qc"))
    .orderBy(desc(orderUnits.createdAt))
}
