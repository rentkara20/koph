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
  await db.transaction(async (tx) => {
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
  sourcingRequestId: z.string().trim().min(1),
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

// Loads every quotation line that belongs to this sourcing request, keyed by
// line id, with the request item it quoted — the fact base for award guards.
async function loadRequestQuotationLines(
  tx: Tx,
  sourcingRequestId: string
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
    .where(eq(supplierRfqs.sourcingRequestId, sourcingRequestId))

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
  try {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .select({ status: sourcingRequests.status })
        .from(sourcingRequests)
        .where(eq(sourcingRequests.id, d.sourcingRequestId))
      if (!request) throw new Error("Sourcing request not found")
      if (["handed_off", "closed", "cancelled"].includes(request.status)) {
        throw new Error("Sourcing request is closed")
      }

      // Immutability lock: if the latest evaluation is already approved, its
      // awards are frozen — supersede the procurement case to change them.
      const [latestEval] = await tx
        .select()
        .from(commercialEvaluations)
        .where(eq(commercialEvaluations.sourcingRequestId, d.sourcingRequestId))
        .orderBy(desc(commercialEvaluations.createdAt))
        .limit(1)
      if (latestEval && latestEval.status === "active") {
        const [approval] = await tx
          .select({ decision: commercialApprovals.decision })
          .from(commercialApprovals)
          .where(eq(commercialApprovals.evaluationId, latestEval.id))
          .orderBy(desc(commercialApprovals.decidedAt))
          .limit(1)
        if (approval?.decision === "approved") {
          throw new Error("Awards are locked under an approved evaluation — supersede the procurement case to change them")
        }
      }

      const linesByLineId = await loadRequestQuotationLines(tx, d.sourcingRequestId)
      const validation = validateAwards(d.awards, linesByLineId)
      if (!validation.ok) {
        throw new Error(
          validation.error === "duplicate_item"
            ? "An item was awarded more than once"
            : validation.error === "line_item_mismatch"
              ? "A chosen quotation did not quote that item"
              : "A chosen quotation line does not belong to this request"
        )
      }

      // Every awarded item must belong to this request and be sourceable.
      const awardedItemIds = d.awards.map((a) => a.sourcingRequestItemId)
      const items = await tx
        .select({ id: sourcingRequestItems.id, status: sourcingRequestItems.status })
        .from(sourcingRequestItems)
        .where(
          and(
            eq(sourcingRequestItems.sourcingRequestId, d.sourcingRequestId),
            inArray(sourcingRequestItems.id, awardedItemIds)
          )
        )
      if (items.length !== awardedItemIds.length) {
        throw new Error("An awarded item does not belong to this request")
      }
      if (items.some((i) => ["cancelled", "not_sourced"].includes(i.status))) {
        throw new Error("An awarded item is not sourceable")
      }

      // Supersede any prior active evaluation (append-only history).
      if (latestEval && latestEval.status === "active") {
        await tx
          .update(commercialEvaluations)
          .set({ status: "superseded", updatedAt: Date.now() })
          .where(eq(commercialEvaluations.id, latestEval.id))
      }

      evaluationId = createId()
      await tx.insert(commercialEvaluations).values({
        id: evaluationId,
        sourcingRequestId: d.sourcingRequestId,
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
        .where(eq(sourcingRequests.id, d.sourcingRequestId))

      await emitDomainEvent(tx, {
        aggregateType: "commercial_evaluation",
        aggregateId: evaluationId,
        eventType: "CommercialEvaluationCreated",
        payload: { sourcingRequestId: d.sourcingRequestId, awardCount: d.awards.length },
        dedupeKey: `commercial_evaluation:${evaluationId}:CommercialEvaluationCreated`,
        actorUserId: session.user.id,
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to award items" }
  }

  revalidatePath(`/admin/sourcing/${d.sourcingRequestId}`)
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
  await db.transaction(async (tx) => {
    const [evaluation] = await tx
      .select()
      .from(commercialEvaluations)
      .where(eq(commercialEvaluations.id, d.evaluationId))
    if (!evaluation) throw new Error("Commercial evaluation not found")

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
      .where(eq(sourcingRequests.id, evaluation.sourcingRequestId))

    await emitDomainEvent(tx, {
      aggregateType: "commercial_approval",
      aggregateId: approvalId,
      eventType: "CommercialApprovalDecided",
      payload: { evaluationId: d.evaluationId, decision: d.decision },
      dedupeKey: `commercial_approval:${approvalId}:CommercialApprovalDecided`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath("/admin/sourcing")
  return { id: approvalId }
}

// ─── Commercial Handoff → Procurement Case ───────────────────────────────────
// Closes the KOPH-owned commercial chain and opens the single operational
// anchor. The case then waits for its external ERP PO to be linked back
// (lib/actions/procurement-case.ts:linkExternalPo).

const handoffSchema = z.object({
  sourcingRequestId: z.string().trim().min(1),
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
  try {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(sourcingRequests)
        .where(eq(sourcingRequests.id, d.sourcingRequestId))
      if (!request) throw new Error("Sourcing request not found")
      if (request.status !== "approved") throw new Error("Sourcing request is not in approved status")

      const [evaluation] = await tx
        .select()
        .from(commercialEvaluations)
        .where(eq(commercialEvaluations.sourcingRequestId, d.sourcingRequestId))
        .orderBy(desc(commercialEvaluations.createdAt))
        .limit(1)
      if (!evaluation) throw new Error("No commercial evaluation found for this sourcing request")

      const [approval] = await tx
        .select()
        .from(commercialApprovals)
        .where(eq(commercialApprovals.evaluationId, evaluation.id))
        .orderBy(desc(commercialApprovals.decidedAt))
        .limit(1)
      if (!approval || approval.decision !== "approved") {
        throw new Error("No approved commercial approval found for this sourcing request")
      }

      // Sourcing V2: group the approved evaluation's awards by supplier — one
      // procurement case per awarded supplier, each destined for its own
      // external ERP PO. Fall back to a single supplier-less case when the
      // evaluation has no award lines (legacy whole-quotation evaluations).
      const awardLines = await tx
        .select({ chosenQuotationLineId: commercialEvaluationLines.chosenQuotationLineId })
        .from(commercialEvaluationLines)
        .where(eq(commercialEvaluationLines.evaluationId, evaluation.id))

      const linesByLineId = await loadRequestQuotationLines(tx, d.sourcingRequestId)
      const supplierIds = [
        ...new Set(
          awardLines
            .map((a) => linesByLineId.get(a.chosenQuotationLineId)?.supplierId)
            .filter((s): s is string => s != null)
        ),
      ]

      if (supplierIds.length === 0) {
        const result = await createProcurementCaseCore(
          tx,
          { source: "commercial_flow", sourcingRequestId: d.sourcingRequestId, commercialApprovalId: approval.id },
          session.user.id
        )
        caseId = result.caseId
      } else {
        for (const supplierId of supplierIds) {
          const result = await createProcurementCaseCore(
            tx,
            {
              source: "commercial_flow",
              sourcingRequestId: d.sourcingRequestId,
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
        .where(eq(sourcingRequests.id, d.sourcingRequestId))
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to hand off to procurement case" }
  }

  revalidatePath(`/admin/sourcing/${d.sourcingRequestId}`)
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
