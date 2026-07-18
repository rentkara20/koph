"use server"

// Commercial Evaluation, Approval, and Handoff (Milestone 4.5 / P4a). Closes
// the commercial chain: Evaluation → Approval → Handoff → Procurement Case
// (lib/actions/procurement-case.ts). Same RBAC gate as createPurchaseOrder
// (lib/actions/procurement.ts) — approval authority already sits with the
// roles that create POs today, no new role. Append-only past creation (locked,
// 2026-07-10): a re-approval after a change is a new commercial_approval row,
// never an edit to the old one.
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  commercialApprovals,
  commercialEvaluationLines,
  commercialEvaluations,
  sourcingRequestItems,
  sourcingRequests,
  supplierQuotationLines,
  supplierQuotations,
  supplierRfqs,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { createProcurementCaseCore } from "@/lib/actions/procurement-case"
import { AWARD_REASONS, validateAwards, type QuotationLineFact } from "@/lib/domain/sourcing-award"

type ActionResult = { error?: string; id?: string }

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ─── Commercial Evaluation ────────────────────────────────────────────────────

const createEvaluationSchema = z.object({
  sourcingRequestId: z.string().trim().min(1),
  chosenQuotationId: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export async function createCommercialEvaluation(
  input: z.infer<typeof createEvaluationSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = createEvaluationSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const evaluationId = createId()
  try {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .select({ status: sourcingRequests.status })
        .from(sourcingRequests)
        .where(eq(sourcingRequests.id, d.sourcingRequestId))
      if (!request) throw new Error("REQUEST_NOT_FOUND")
      // Don't regress a request that's already past evaluation.
      if (["approved", "rejected", "handed_off", "cancelled", "closed"].includes(request.status)) {
        throw new Error("REQUEST_LOCKED")
      }

      // Append-only history: supersede any prior active evaluation so there is
      // exactly one "active" evaluation per request (matches awardSourcingItems).
      await tx
        .update(commercialEvaluations)
        .set({ status: "superseded", updatedAt: Date.now() })
        .where(
          and(
            eq(commercialEvaluations.sourcingRequestId, d.sourcingRequestId),
            eq(commercialEvaluations.status, "active")
          )
        )

      await tx.insert(commercialEvaluations).values({
        id: evaluationId,
        sourcingRequestId: d.sourcingRequestId,
        chosenQuotationId: d.chosenQuotationId ?? null,
        notes: d.notes,
        createdBy: session.user.id,
      })
      await tx
        .update(sourcingRequests)
        .set({ status: "under_evaluation", updatedAt: Date.now() })
        .where(eq(sourcingRequests.id, d.sourcingRequestId))

      await emitDomainEvent(tx, {
        aggregateType: "commercial_evaluation",
        aggregateId: evaluationId,
        eventType: "CommercialEvaluationCreated",
        payload: { sourcingRequestId: d.sourcingRequestId, chosenQuotationId: d.chosenQuotationId ?? null },
        dedupeKey: `commercial_evaluation:${evaluationId}:CommercialEvaluationCreated`,
        actorUserId: session.user.id,
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return { error: "Sourcing request not found" }
    }
    if (error instanceof Error && error.message === "REQUEST_LOCKED") {
      return { error: "This request is already past evaluation and cannot be re-evaluated" }
    }
    return { error: error instanceof Error ? error.message : "Failed to create evaluation" }
  }

  revalidatePath(`/admin/sourcing/${d.sourcingRequestId}`)
  return { id: evaluationId }
}

// ─── Per-item award (Sourcing V2) ────────────────────────────────────────────
// Awarding is the real decision: each request item is bound to a specific
// quotation line, with a mandatory reason. Awards are the single source of
// truth — an item is "selected" purely because it carries an award under the
// active evaluation (commercial_evaluation_line). Re-awarding supersedes the
// prior active evaluation (append-only history). Once an evaluation is
// approved its awards are immutable — the caller must supersede the
// procurement case to change them.

const awardItemsSchema = z.object({
  // Sourcing V3: request membership is derived from the awarded items
  // themselves (they may span more than one request) — no longer a required
  // input the caller must get right.
  notes: z.string().trim().max(2000).optional(),
  awards: z
    .array(
      z.object({
        sourcingRequestItemId: z.string().trim().min(1),
        quotationLineId: z.string().trim().min(1),
        reason: z.enum(AWARD_REASONS),
        notes: z.string().trim().max(1000).optional(),
      })
    )
    .min(1),
})

// Loads every quotation line that answered one of the given items, keyed by
// line id, with the item it quoted and the supplier that offered it — the
// fact base for award guards. Item-scoped (not request-scoped): a
// consolidated RFQ leaves supplier_rfq.sourcingRequestId null, so finding
// candidate lines via the RFQ's own request id would miss them.
async function loadQuotationLinesForItems(
  tx: Tx,
  itemIds: string[]
): Promise<Map<string, QuotationLineFact & { supplierId: string }>> {
  const rows = await tx
    .select({
      lineId: supplierQuotationLines.id,
      itemId: supplierQuotationLines.sourcingRequestItemId,
      supplierId: supplierRfqs.supplierId,
    })
    .from(supplierQuotationLines)
    .innerJoin(supplierQuotations, eq(supplierQuotationLines.quotationId, supplierQuotations.id))
    .innerJoin(supplierRfqs, eq(supplierQuotations.rfqId, supplierRfqs.id))
    .where(inArray(supplierQuotationLines.sourcingRequestItemId, itemIds))

  const map = new Map<string, QuotationLineFact & { supplierId: string }>()
  for (const r of rows) {
    if (!r.itemId) continue // legacy lines with no item binding cannot be awarded
    map.set(r.lineId, { quotationLineId: r.lineId, sourcingRequestItemId: r.itemId, supplierId: r.supplierId })
  }
  return map
}

export async function awardSourcingItems(input: z.infer<typeof awardItemsSchema>): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = awardItemsSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  let evaluationId = ""
  let affectedRequestIds: string[] = []
  try {
    await db.transaction(async (tx) => {
      const awardedItemIds = d.awards.map((a) => a.sourcingRequestItemId)

      // Every awarded item must exist and be sourceable — request membership
      // is derived from the items themselves (Sourcing V3: awards may span
      // more than one request), not passed in and checked against one id.
      const items = await tx
        .select({
          id: sourcingRequestItems.id,
          status: sourcingRequestItems.status,
          sourcingRequestId: sourcingRequestItems.sourcingRequestId,
        })
        .from(sourcingRequestItems)
        .where(inArray(sourcingRequestItems.id, awardedItemIds))
      if (items.length !== awardedItemIds.length) {
        throw new Error("An awarded item was not found")
      }
      if (items.some((i) => ["cancelled", "not_sourced"].includes(i.status))) {
        throw new Error("An awarded item is not sourceable")
      }

      affectedRequestIds = [...new Set(items.map((i) => i.sourcingRequestId))]
      const requests = await tx
        .select({ id: sourcingRequests.id, status: sourcingRequests.status })
        .from(sourcingRequests)
        .where(inArray(sourcingRequests.id, affectedRequestIds))
      if (requests.some((r) => ["handed_off", "closed", "cancelled"].includes(r.status))) {
        throw new Error("Sourcing request is closed")
      }

      // Immutability lock: an item already governed by an active evaluation
      // that has been approved is frozen — supersede the procurement case to
      // change it. Checked per-item so a cross-request submission can't
      // silently re-award an item locked by an unrelated approved evaluation.
      const lockingEvaluations = await tx
        .select({ evaluationId: commercialEvaluationLines.evaluationId })
        .from(commercialEvaluationLines)
        .innerJoin(commercialEvaluations, eq(commercialEvaluations.id, commercialEvaluationLines.evaluationId))
        .innerJoin(commercialApprovals, eq(commercialApprovals.evaluationId, commercialEvaluations.id))
        .where(
          and(
            inArray(commercialEvaluationLines.sourcingRequestItemId, awardedItemIds),
            eq(commercialEvaluations.status, "active"),
            eq(commercialApprovals.decision, "approved")
          )
        )
      if (lockingEvaluations.length > 0) {
        throw new Error("Awards are locked under an approved evaluation — supersede the procurement case to change them")
      }

      const linesByLineId = await loadQuotationLinesForItems(tx, awardedItemIds)
      const validation = validateAwards(d.awards, linesByLineId)
      if (!validation.ok) {
        throw new Error(
          validation.error === "duplicate_item"
            ? "An item was awarded more than once"
            : validation.error === "line_item_mismatch"
              ? "A chosen quotation did not quote that item"
              : "A chosen quotation line did not quote any of the awarded items"
        )
      }

      // Supersede any prior active evaluation that currently governs any of
      // these items (surgical — only evaluations actually touching the items
      // being re-awarded, not every evaluation for the affected requests).
      const activeEvaluationIds = [
        ...new Set(
          (
            await tx
              .select({ evaluationId: commercialEvaluationLines.evaluationId })
              .from(commercialEvaluationLines)
              .innerJoin(commercialEvaluations, eq(commercialEvaluations.id, commercialEvaluationLines.evaluationId))
              .where(
                and(
                  inArray(commercialEvaluationLines.sourcingRequestItemId, awardedItemIds),
                  eq(commercialEvaluations.status, "active")
                )
              )
          ).map((r) => r.evaluationId)
        ),
      ]
      if (activeEvaluationIds.length > 0) {
        await tx
          .update(commercialEvaluations)
          .set({ status: "superseded", updatedAt: Date.now() })
          .where(inArray(commercialEvaluations.id, activeEvaluationIds))
      }

      evaluationId = createId()
      await tx.insert(commercialEvaluations).values({
        id: evaluationId,
        // Legacy single-request display convenience — null once items span
        // more than one request; the real origin is per-item (see P3).
        sourcingRequestId: affectedRequestIds.length === 1 ? affectedRequestIds[0] : null,
        notes: d.notes,
        createdBy: session.user.id,
      })
      for (const award of d.awards) {
        await tx.insert(commercialEvaluationLines).values({
          id: createId(),
          evaluationId,
          sourcingRequestItemId: award.sourcingRequestItemId,
          chosenQuotationLineId: award.quotationLineId,
          reason: award.reason,
          notes: award.notes,
        })
      }

      // Awarded items derive to "selected".
      await tx
        .update(sourcingRequestItems)
        .set({ status: "selected", updatedAt: Date.now() })
        .where(inArray(sourcingRequestItems.id, awardedItemIds))

      await tx
        .update(sourcingRequests)
        .set({ status: "under_evaluation", updatedAt: Date.now() })
        .where(inArray(sourcingRequests.id, affectedRequestIds))

      await emitDomainEvent(tx, {
        aggregateType: "commercial_evaluation",
        aggregateId: evaluationId,
        eventType: "CommercialEvaluationCreated",
        payload: { sourcingRequestIds: affectedRequestIds, awardCount: d.awards.length },
        dedupeKey: `commercial_evaluation:${evaluationId}:CommercialEvaluationCreated`,
        actorUserId: session.user.id,
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to award items" }
  }

  for (const requestId of affectedRequestIds) {
    revalidatePath(`/admin/sourcing/${requestId}`)
  }
  return { id: evaluationId }
}

// ─── Commercial Approval (append-only) ───────────────────────────────────────

const decideApprovalSchema = z.object({
  evaluationId: z.string().trim().min(1),
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().trim().max(2000).optional(),
})

export async function decideCommercialApproval(
  input: z.infer<typeof decideApprovalSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = decideApprovalSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const approvalId = createId()
  try {
    await db.transaction(async (tx) => {
      const [evaluation] = await tx
        .select()
        .from(commercialEvaluations)
        .where(eq(commercialEvaluations.id, d.evaluationId))
      if (!evaluation) throw new Error("EVAL_NOT_FOUND")
      // Only the current active evaluation is decidable — never a superseded one.
      if (evaluation.status !== "active") throw new Error("EVAL_NOT_ACTIVE")

      // Sourcing V3: derive every affected request from the evaluation's
      // award lines — an evaluation may span more than one request now, so
      // evaluation.sourcingRequestId (null once it does) can't be relied on.
      const affectedRequestIds = [
        ...new Set(
          (
            await tx
              .select({ requestId: sourcingRequestItems.sourcingRequestId })
              .from(commercialEvaluationLines)
              .innerJoin(sourcingRequestItems, eq(sourcingRequestItems.id, commercialEvaluationLines.sourcingRequestItemId))
              .where(eq(commercialEvaluationLines.evaluationId, d.evaluationId))
          ).map((r) => r.requestId)
        ),
      ]
      if (affectedRequestIds.length === 0) throw new Error("REQUEST_NOT_FOUND")

      const requests = await tx
        .select({ id: sourcingRequests.id, status: sourcingRequests.status })
        .from(sourcingRequests)
        .where(inArray(sourcingRequests.id, affectedRequestIds))
      // Don't regress a request that's already handed off / closed.
      if (requests.some((r) => ["handed_off", "cancelled", "closed"].includes(r.status))) {
        throw new Error("REQUEST_LOCKED")
      }

      await tx.insert(commercialApprovals).values({
        id: approvalId,
        evaluationId: d.evaluationId,
        decision: d.decision,
        approverId: session.user.id,
        notes: d.notes,
      })
      await tx
        .update(sourcingRequests)
        .set({ status: d.decision === "approved" ? "approved" : "rejected", updatedAt: Date.now() })
        .where(inArray(sourcingRequests.id, affectedRequestIds))

      await emitDomainEvent(tx, {
        aggregateType: "commercial_approval",
        aggregateId: approvalId,
        eventType: "CommercialApprovalDecided",
        payload: { evaluationId: d.evaluationId, decision: d.decision },
        dedupeKey: `commercial_approval:${approvalId}:CommercialApprovalDecided`,
        actorUserId: session.user.id,
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "EVAL_NOT_FOUND") {
      return { error: "Commercial evaluation not found" }
    }
    if (error instanceof Error && error.message === "EVAL_NOT_ACTIVE") {
      return { error: "This evaluation has been superseded and can no longer be decided" }
    }
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return { error: "Sourcing request not found" }
    }
    if (error instanceof Error && error.message === "REQUEST_LOCKED") {
      return { error: "This request is already handed off or closed" }
    }
    return { error: error instanceof Error ? error.message : "Failed to record decision" }
  }

  revalidatePath("/admin/sourcing")
  return { id: approvalId }
}

// ─── Commercial Handoff → Procurement Case ───────────────────────────────────
// Closes the KOPH-owned commercial chain and opens the single operational
// anchor. The case then waits for its external ERP PO to be linked back
// (lib/actions/procurement-case.ts:linkExternalPo).

const handoffSchema = z.object({
  evaluationId: z.string().trim().min(1),
})

export async function handoffToProcurementCase(
  input: z.infer<typeof handoffSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = handoffSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  let caseId = ""
  let affectedRequestIds: string[] = []
  try {
    await db.transaction(async (tx) => {
      const [evaluation] = await tx
        .select()
        .from(commercialEvaluations)
        .where(eq(commercialEvaluations.id, d.evaluationId))
      if (!evaluation) throw new Error("Commercial evaluation not found")

      const [approval] = await tx
        .select()
        .from(commercialApprovals)
        .where(eq(commercialApprovals.evaluationId, evaluation.id))
        .orderBy(desc(commercialApprovals.decidedAt))
        .limit(1)
      if (!approval || approval.decision !== "approved") {
        throw new Error("No approved commercial approval found for this evaluation")
      }

      // Sourcing V3: every request an awarded item in this evaluation came
      // from — an evaluation may span more than one request. Every one of
      // them must be in "approved" status before handoff proceeds.
      const awardLines = await tx
        .select({
          chosenQuotationLineId: commercialEvaluationLines.chosenQuotationLineId,
          sourcingRequestItemId: commercialEvaluationLines.sourcingRequestItemId,
        })
        .from(commercialEvaluationLines)
        .where(eq(commercialEvaluationLines.evaluationId, evaluation.id))

      const awardedItemIds = awardLines.map((l) => l.sourcingRequestItemId)
      const items = await tx
        .select({ id: sourcingRequestItems.id, sourcingRequestId: sourcingRequestItems.sourcingRequestId })
        .from(sourcingRequestItems)
        .where(inArray(sourcingRequestItems.id, awardedItemIds))
      affectedRequestIds = [...new Set(items.map((i) => i.sourcingRequestId))]

      const requests = await tx
        .select({ id: sourcingRequests.id, status: sourcingRequests.status })
        .from(sourcingRequests)
        .where(inArray(sourcingRequests.id, affectedRequestIds))
      if (requests.some((r) => r.status !== "approved")) {
        throw new Error("Every sourcing request covered by this evaluation must be approved first")
      }

      // Sourcing V2: group the approved evaluation's awards by supplier — one
      // procurement case per awarded supplier, each destined for its own
      // external ERP PO. Fall back to a single supplier-less case when the
      // evaluation has no award lines (legacy whole-quotation evaluations).
      const linesByLineId = await loadQuotationLinesForItems(tx, awardedItemIds)
      const supplierIds = [
        ...new Set(
          awardLines
            .map((a) => linesByLineId.get(a.chosenQuotationLineId)?.supplierId)
            .filter((s): s is string => s != null)
        ),
      ]

      // Legacy single-request display convenience on the case — null once
      // the handoff spans more than one request (traceability then comes
      // from commercialApprovalId, see getProcurementCaseSourceRequestsCore).
      const caseSourcingRequestId = affectedRequestIds.length === 1 ? affectedRequestIds[0] : undefined

      if (supplierIds.length === 0) {
        const result = await createProcurementCaseCore(
          tx,
          { source: "commercial_flow", sourcingRequestId: caseSourcingRequestId, commercialApprovalId: approval.id },
          session.user.id
        )
        caseId = result.caseId
      } else {
        for (const supplierId of supplierIds) {
          const result = await createProcurementCaseCore(
            tx,
            {
              source: "commercial_flow",
              sourcingRequestId: caseSourcingRequestId,
              commercialApprovalId: approval.id,
              supplierId,
            },
            session.user.id
          )
          caseId = result.caseId
        }
      }

      await tx
        .update(sourcingRequests)
        .set({ status: "handed_off", updatedAt: Date.now() })
        .where(inArray(sourcingRequests.id, affectedRequestIds))
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to hand off to procurement case" }
  }

  for (const requestId of affectedRequestIds) {
    revalidatePath(`/admin/sourcing/${requestId}`)
  }
  revalidatePath("/admin/procurement")
  return { id: caseId }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getLatestCommercialEvaluation(sourcingRequestId: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [evaluation] = await db
    .select()
    .from(commercialEvaluations)
    .where(eq(commercialEvaluations.sourcingRequestId, sourcingRequestId))
    .orderBy(desc(commercialEvaluations.createdAt))
    .limit(1)
  return evaluation ?? null
}

// Latest evaluation's per-item awards, joined for display: item, chosen
// quotation line (offered spec/PN/price), supplier, and the stated reason.
export async function getSourcingAwards(sourcingRequestId: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [evaluation] = await db
    .select()
    .from(commercialEvaluations)
    .where(eq(commercialEvaluations.sourcingRequestId, sourcingRequestId))
    .orderBy(desc(commercialEvaluations.createdAt))
    .limit(1)
  if (!evaluation) return null

  const [approval] = await db
    .select({ decision: commercialApprovals.decision })
    .from(commercialApprovals)
    .where(eq(commercialApprovals.evaluationId, evaluation.id))
    .orderBy(desc(commercialApprovals.decidedAt))
    .limit(1)

  const lines = await db
    .select({
      itemId: commercialEvaluationLines.sourcingRequestItemId,
      itemDescription: sourcingRequestItems.supplierDescription,
      quantity: sourcingRequestItems.quantity,
      reason: commercialEvaluationLines.reason,
      notes: commercialEvaluationLines.notes,
      unitPrice: supplierQuotationLines.unitPrice,
      currency: supplierQuotationLines.currency,
      offeredPartNumber: supplierQuotationLines.offeredPartNumber,
      supplierName: suppliers.name,
    })
    .from(commercialEvaluationLines)
    .innerJoin(sourcingRequestItems, eq(commercialEvaluationLines.sourcingRequestItemId, sourcingRequestItems.id))
    .innerJoin(supplierQuotationLines, eq(commercialEvaluationLines.chosenQuotationLineId, supplierQuotationLines.id))
    .innerJoin(supplierQuotations, eq(supplierQuotationLines.quotationId, supplierQuotations.id))
    .innerJoin(supplierRfqs, eq(supplierQuotations.rfqId, supplierRfqs.id))
    .innerJoin(suppliers, eq(supplierRfqs.supplierId, suppliers.id))
    .where(eq(commercialEvaluationLines.evaluationId, evaluation.id))

  return { evaluation, approvalDecision: approval?.decision ?? null, lines }
}
