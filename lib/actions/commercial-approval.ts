"use server"

// Commercial Evaluation, Approval, and Handoff (Milestone 4.5 / P4a). Closes
// the commercial chain: Evaluation → Approval → Handoff → Procurement Case
// (lib/actions/procurement-case.ts). Same RBAC gate as createPurchaseOrder
// (lib/actions/procurement.ts) — approval authority already sits with the
// roles that create POs today, no new role. Append-only past creation (locked,
// 2026-07-10): a re-approval after a change is a new commercial_approval row,
// never an edit to the old one.
import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { commercialApprovals, commercialEvaluations, sourcingRequests } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { createProcurementCaseCore } from "@/lib/actions/procurement-case"

type ActionResult = { error?: string; id?: string }

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

      const result = await createProcurementCaseCore(
        tx,
        { source: "commercial_flow", sourcingRequestId: d.sourcingRequestId, commercialApprovalId: approval.id },
        session.user.id
      )
      caseId = result.caseId

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
