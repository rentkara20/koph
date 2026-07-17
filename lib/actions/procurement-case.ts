"use server"

// Procurement Case (Milestone 4.5 / P4a) — the single operational anchor.
// Every purchase belongs to exactly one: created either from an approved
// commercial-flow (source="commercial_flow") or auto-created for a manual PO
// (source="system_manual") — never a second procurement workflow. Append-only
// past creation and past its ERP-PO link being set (locked, 2026-07-10): a
// change is a new row that supersedes the old one, never an edit.
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  commercialApprovals,
  orderUnits,
  partners,
  partnerTasks,
  pickupTaskLines,
  procurementCases,
  purchaseOrderLines,
  purchaseOrders,
  sourcingRequests,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import {
  canCloseProcurementCase,
  deriveProcurementFulfilment,
} from "@/lib/domain/procurement-fulfilment"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type ActionResult = { error?: string; id?: string }

// ─── Create (called both by the manual-PO chokepoint and the commercial-flow
// handoff — same function, one anchor) ───────────────────────────────────────

const createCaseSchema = z.object({
  source: z.enum(["commercial_flow", "system_manual"]),
  sourcingRequestId: z.string().trim().min(1).optional(),
  commercialApprovalId: z.string().trim().min(1).optional(),
  // Sourcing V2: the awarded supplier for this case. One case per
  // (request × supplier) → one external ERP PO each.
  supplierId: z.string().trim().min(1).optional(),
})

export async function createProcurementCaseCore(
  tx: Tx,
  input: z.infer<typeof createCaseSchema>,
  actorUserId: string | null
): Promise<{ caseId: string }> {
  const d = createCaseSchema.parse(input)
  if (d.source === "commercial_flow" && !d.commercialApprovalId) {
    throw new Error("commercial_flow case requires an approved commercialApprovalId")
  }

  const caseId = createId()
  await tx.insert(procurementCases).values({
    id: caseId,
    source: d.source,
    sourcingRequestId: d.sourcingRequestId ?? null,
    commercialApprovalId: d.commercialApprovalId ?? null,
    supplierId: d.supplierId ?? null,
    status: "open",
    createdBy: actorUserId,
  })

  await emitDomainEvent(tx, {
    aggregateType: "procurement_case",
    aggregateId: caseId,
    eventType: "ProcurementCaseCreated",
    payload: {
      source: d.source,
      sourcingRequestId: d.sourcingRequestId ?? null,
      supplierId: d.supplierId ?? null,
    },
    dedupeKey: `procurement_case:${caseId}:ProcurementCaseCreated`,
    actorUserId,
  })

  return { caseId }
}

// ─── Link the external ERP PO reference back onto the case ──────────────────
// Set-once: throws if already linked, per the immutable-history rule — the
// caller must supersede the case instead of editing the link.

const linkExternalPoSchema = z.object({
  procurementCaseId: z.string().trim().min(1),
  erpSystem: z.enum(["zoho", "odoo"]),
  externalPoRef: z.string().trim().min(1).max(120),
})

export async function linkExternalPoCore(
  tx: Tx,
  input: z.infer<typeof linkExternalPoSchema>,
  actorUserId: string | null
): Promise<void> {
  const d = linkExternalPoSchema.parse(input)

  const [existing] = await tx
    .select({ externalPoRef: procurementCases.externalPoRef, status: procurementCases.status })
    .from(procurementCases)
    .where(eq(procurementCases.id, d.procurementCaseId))
  if (!existing) throw new Error("Procurement case not found")
  if (existing.status === "superseded") throw new Error("Procurement case is superseded — link the case that superseded it")
  if (existing.externalPoRef) {
    throw new Error("Procurement case already linked to an external PO — supersede the case to change it")
  }

  await tx
    .update(procurementCases)
    .set({
      erpSystem: d.erpSystem,
      externalPoRef: d.externalPoRef,
      externalPoCreatedAt: Date.now(),
      status: "po_linked",
      updatedAt: Date.now(),
    })
    .where(eq(procurementCases.id, d.procurementCaseId))

  await emitDomainEvent(tx, {
    aggregateType: "procurement_case",
    aggregateId: d.procurementCaseId,
    eventType: "ProcurementCaseLinkedToExternalPo",
    payload: { erpSystem: d.erpSystem, externalPoRef: d.externalPoRef },
    dedupeKey: `procurement_case:${d.procurementCaseId}:ProcurementCaseLinkedToExternalPo`,
    actorUserId,
  })
}

export async function linkExternalPo(input: z.infer<typeof linkExternalPoSchema>): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = linkExternalPoSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  try {
    await db.transaction(async (tx) => {
      await linkExternalPoCore(tx, parsed.data, session.user.id)
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to link external PO" }
  }

  revalidatePath("/admin/procurement")
  return { id: input.procurementCaseId }
}

// ─── Supersede — the only way to "change" a case past creation ──────────────

const supersedeSchema = z.object({
  caseId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(2000),
})

// Exported separately so integration tests can exercise the atomic supersede
// path directly, same rationale as createAssetCore/receivePurchaseOrderLineCore.
export async function supersedeProcurementCaseCore(
  tx: Tx,
  input: z.infer<typeof supersedeSchema>,
  actorUserId: string | null
): Promise<{ caseId: string }> {
  const d = supersedeSchema.parse(input)

  const [old] = await tx.select().from(procurementCases).where(eq(procurementCases.id, d.caseId))
  if (!old) throw new Error("Procurement case not found")
  if (old.status === "superseded") throw new Error("Procurement case is already superseded")

  const newCaseId = createId()
  await tx.insert(procurementCases).values({
    id: newCaseId,
    source: old.source,
    sourcingRequestId: old.sourcingRequestId,
    commercialApprovalId: old.commercialApprovalId,
    // Carry the awarded supplier forward — Sourcing V2 is one case per awarded
    // supplier, so dropping it would produce a successor with a null supplier
    // and break the one-case-per-supplier mapping.
    supplierId: old.supplierId,
    status: "open",
    previousCaseId: old.id,
    createdBy: actorUserId,
  })
  await tx
    .update(procurementCases)
    .set({ status: "superseded", supersededByCaseId: newCaseId, updatedAt: Date.now() })
    .where(eq(procurementCases.id, old.id))

  await emitDomainEvent(tx, {
    aggregateType: "procurement_case",
    aggregateId: newCaseId,
    eventType: "ProcurementCaseSuperseded",
    payload: { previousCaseId: old.id, reason: d.reason },
    dedupeKey: `procurement_case:${old.id}:ProcurementCaseSuperseded:${newCaseId}`,
    actorUserId,
  })

  return { caseId: newCaseId }
}

export async function supersedeProcurementCase(
  input: z.infer<typeof supersedeSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = supersedeSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let newCaseId = ""
  try {
    await db.transaction(async (tx) => {
      const result = await supersedeProcurementCaseCore(tx, parsed.data, session.user.id)
      newCaseId = result.caseId
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to supersede procurement case" }
  }

  revalidatePath("/admin/procurement")
  return { id: newCaseId }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getProcurementCase(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [procurementCase] = await db.select().from(procurementCases).where(eq(procurementCases.id, id))
  if (!procurementCase) return null

  const [sourcingRequest] = procurementCase.sourcingRequestId
    ? await db.select().from(sourcingRequests).where(eq(sourcingRequests.id, procurementCase.sourcingRequestId))
    : [null]
  const [approval] = procurementCase.commercialApprovalId
    ? await db.select().from(commercialApprovals).where(eq(commercialApprovals.id, procurementCase.commercialApprovalId))
    : [null]
  const linkedPurchaseOrders = await db
    .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.procurementCaseId, id))

  return { procurementCase, sourcingRequest, approval, linkedPurchaseOrders }
}

// Latest non-superseded case for a sourcing request (a supersede copies
// sourcingRequestId onto the new case, so more than one row can share it).
export async function getProcurementCaseForSourcingRequest(sourcingRequestId: string) {
  const session = await getStaffSession()
  if (!session) return null

  const cases = await db
    .select()
    .from(procurementCases)
    .where(eq(procurementCases.sourcingRequestId, sourcingRequestId))
    .orderBy(desc(procurementCases.createdAt))
  if (cases.length === 0) return null

  return cases.find((c) => c.status !== "superseded") ?? cases[0]
}

// All non-superseded cases for a sourcing request (Sourcing V2: handoff can
// create one case per awarded supplier), newest first, with supplier name.
export async function getProcurementCasesForSourcingRequest(sourcingRequestId: string) {
  const session = await getStaffSession()
  if (!session) return []

  const cases = await db
    .select({
      id: procurementCases.id,
      status: procurementCases.status,
      supplierId: procurementCases.supplierId,
      supplierName: suppliers.name,
      externalPoRef: procurementCases.externalPoRef,
      createdAt: procurementCases.createdAt,
    })
    .from(procurementCases)
    .leftJoin(suppliers, eq(procurementCases.supplierId, suppliers.id))
    .where(eq(procurementCases.sourcingRequestId, sourcingRequestId))
    .orderBy(desc(procurementCases.createdAt))

  return cases.filter((c) => c.status !== "superseded")
}

// ─── Close (end of the procurement journey) ───────────────────────────────────
// Allowed only when the fulfilment derivation says every ordered unit on the
// case's PO has been received and no pickup task is still open — the "closed"
// enum value finally gets a real transition.

export async function closeProcurementCase(caseId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [procurementCase] = await db
    .select()
    .from(procurementCases)
    .where(eq(procurementCases.id, caseId))
  if (!procurementCase) return { error: "Procurement case not found" }

  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.procurementCaseId, caseId))
  const lines = po
    ? await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, po.id))
    : []
  const pickupTasks = po
    ? await db
        .select({ status: partnerTasks.status })
        .from(partnerTasks)
        .where(eq(partnerTasks.purchaseOrderId, po.id))
    : []

  const closable = canCloseProcurementCase({
    caseStatus: procurementCase.status,
    po: po ? { status: po.status, paidAt: po.paidAt, readyForPickupAt: po.readyForPickupAt } : null,
    lines: lines.map((l) => ({
      status: l.status,
      qtyOrdered: l.qtyOrdered,
      qtyPickedUp: l.qtyPickedUp,
      qtyReceived: l.qtyReceived,
    })),
    pickupTasks,
  })
  if (!closable) {
    return { error: "Case can close only after every ordered unit has been received" }
  }

  let rowsChanged = 0
  await db.transaction(async (tx) => {
    const result = await tx
      .update(procurementCases)
      .set({ status: "closed", updatedAt: Date.now() })
      .where(and(eq(procurementCases.id, caseId), eq(procurementCases.status, procurementCase.status)))
    rowsChanged = (result as { rowsAffected?: number }).rowsAffected ?? 1
    if (rowsChanged === 0) return

    await emitDomainEvent(tx, {
      aggregateType: "procurement_case",
      aggregateId: caseId,
      eventType: "ProcurementCaseClosed",
      payload: { purchaseOrderId: po?.id ?? null },
      dedupeKey: `procurement_case:${caseId}:ProcurementCaseClosed`,
      actorUserId: session.user.id,
    })
  })
  if (rowsChanged === 0) return { error: "Case status changed — refresh and retry" }

  revalidatePath("/admin/procurement")
  return { id: caseId }
}

// ─── End-to-end fulfilment view for a case/PO ────────────────────────────────
// Derived, never stored: stage + qty rollup + the journey of every asset
// minted from the PO (current status/customer), for the case detail page.

export async function getProcurementFulfilment(purchaseOrderId: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
  if (!po) return null

  const [procurementCase] = await db
    .select()
    .from(procurementCases)
    .where(eq(procurementCases.id, po.procurementCaseId))

  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId))
    .orderBy(purchaseOrderLines.createdAt)

  const pickupTasks = await db
    .select({
      id: partnerTasks.id,
      status: partnerTasks.status,
      partnerId: partnerTasks.partnerId,
      partnerName: partners.name,
      partnerMobile: partners.mobile,
      taskToken: partnerTasks.taskToken,
      destinationLocation: partnerTasks.destinationLocation,
      assignedAt: partnerTasks.assignedAt,
      arrivedAt: partnerTasks.arrivedAt,
      pickedUpAt: partnerTasks.pickedUpAt,
      closedAt: partnerTasks.closedAt,
    })
    .from(partnerTasks)
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .where(eq(partnerTasks.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(partnerTasks.createdAt))

  const taskLines = pickupTasks.length
    ? await db
        .select()
        .from(pickupTaskLines)
        .where(
          inArray(
            pickupTaskLines.pickupTaskId,
            pickupTasks.map((t) => t.id)
          )
        )
    : []

  const assets = await db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      status: orderUnits.status,
      currentCustomerId: orderUnits.currentCustomerId,
      purchaseOrderLineId: orderUnits.purchaseOrderLineId,
      createdAt: orderUnits.createdAt,
    })
    .from(orderUnits)
    .where(eq(orderUnits.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(orderUnits.createdAt))

  const fulfilment = deriveProcurementFulfilment({
    caseStatus: procurementCase?.status ?? "open",
    po: { status: po.status, paidAt: po.paidAt, readyForPickupAt: po.readyForPickupAt },
    lines: lines.map((l) => ({
      status: l.status,
      qtyOrdered: l.qtyOrdered,
      qtyPickedUp: l.qtyPickedUp,
      qtyReceived: l.qtyReceived,
    })),
    pickupTasks,
  })

  return { po, procurementCase: procurementCase ?? null, lines, pickupTasks, taskLines, assets, ...fulfilment }
}
