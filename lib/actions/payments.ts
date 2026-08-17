"use server"

import { and, count, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  partners,
  partnerPayments,
  partnerPaymentDecisions,
  partnerTasks,
  paymentBatches,
  requests,
  customers,
  requestItems,
  requestTypes,
  servicesCatalog,
  taskServices,
} from "@/lib/db/schema"
import { createId, generateSecureToken } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import { periodSchema, firstError } from "@/lib/validation/schemas"
import { checkRateLimit } from "@/lib/utils/rate-limit"
import { getBusinessMonthOffsetModifier } from "@/lib/actions/settings"
import { logActivity } from "@/lib/utils/activity"
import { sumBatchTotal } from "@/lib/domain/payments"
import { emitDomainEvent } from "@/lib/actions/domain-events"

export type PaymentActionResult = { error?: string; id?: string }

export type PaymentReviewFilters = {
  from?: string
  to?: string
  partnerIds?: string[]
}

type FinanceNoteData = {
  financeServiceType?: string
  financeServiceDescription?: string
  notes?: string
}

function parseFinanceNotes(value: string | null): FinanceNoteData {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as FinanceNoteData
    if (parsed && typeof parsed === "object") return parsed
  } catch {
    // Legacy free-text notes remain valid notes.
  }
  return { notes: value }
}

function serializeFinanceNotes(input: FinanceNoteData): string | null {
  const trimmed = {
    financeServiceType: input.financeServiceType?.trim() || undefined,
    financeServiceDescription: input.financeServiceDescription?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  }
  if (!trimmed.financeServiceType && !trimmed.financeServiceDescription && !trimmed.notes) return null
  return JSON.stringify(trimmed)
}

function parseDateStart(value?: string): number | null {
  if (!value) return null
  const time = new Date(`${value}T00:00:00+03:00`).getTime()
  return Number.isNaN(time) ? null : time
}

function parseDateEnd(value?: string): number | null {
  if (!value) return null
  const time = new Date(`${value}T23:59:59.999+03:00`).getTime()
  return Number.isNaN(time) ? null : time
}

// Thrown inside a transaction when a guarded status UPDATE affects 0 rows —
// i.e. a concurrent writer already moved the batch/payment out of the status we
// validated against. Aborts the transaction so no event/audit is written; the
// caller maps it back to the user-facing "wrong status" message.
class StaleStatusError extends Error {}
function assertChanged(result: unknown): void {
  if (((result as { rowsAffected?: number }).rowsAffected ?? 0) === 0) throw new StaleStatusError()
}

// Recompute a batch's stored total from its current line items, inside the given
// transaction. The batch total must always equal the sum of items still in it
// (batched/paid); a held item is pulled out and must stop counting. Call after
// any change to batch membership. Pure math lives in lib/domain/payments.ts.
type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0]
async function recalcBatchTotal(tx: TxLike, batchId: string): Promise<void> {
  const lines = await tx
    .select({ totalAmount: partnerPayments.totalAmount, status: partnerPayments.status })
    .from(partnerPayments)
    .where(eq(partnerPayments.batchId, batchId))
  const total = sumBatchTotal(lines)
  await tx.update(paymentBatches).set({ totalAmount: total }).where(eq(paymentBatches.id, batchId))
}

// ─── Get all payment batches ──────────────────────────────────────────────────

export async function getPaymentBatches() {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({
      id: paymentBatches.id,
      period: paymentBatches.period,
      totalAmount: paymentBatches.totalAmount,
      status: paymentBatches.status,
      generatedAt: paymentBatches.generatedAt,
      approvedAt: paymentBatches.approvedAt,
      sentAt: paymentBatches.sentAt,
      paidAt: paymentBatches.paidAt,
      partnerId: paymentBatches.partnerId,
      partnerName: partners.name,
      paymentCount: count(partnerPayments.id),
    })
    .from(paymentBatches)
    .leftJoin(partners, eq(paymentBatches.partnerId, partners.id))
    .leftJoin(partnerPayments, eq(partnerPayments.batchId, paymentBatches.id))
    .groupBy(paymentBatches.id)
    .orderBy(desc(paymentBatches.generatedAt))
}

// ─── Get batch with its payments ──────────────────────────────────────────────

export async function getBatchWithPayments(batchId: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [batch] = await db
    .select({
      id: paymentBatches.id,
      period: paymentBatches.period,
      totalAmount: paymentBatches.totalAmount,
      status: paymentBatches.status,
      notes: paymentBatches.notes,
      generatedAt: paymentBatches.generatedAt,
      approvedAt: paymentBatches.approvedAt,
      sentAt: paymentBatches.sentAt,
      paidAt: paymentBatches.paidAt,
      partnerId: paymentBatches.partnerId,
      partnerName: partners.name,
    })
    .from(paymentBatches)
    .leftJoin(partners, eq(paymentBatches.partnerId, partners.id))
    .where(eq(paymentBatches.id, batchId))

  if (!batch) return null

  // Tolerant fetch — statement_token column may not exist on an un-migrated DB
  let statementToken: string | null = null
  try {
    const [row] = await db
      .select({ statementToken: paymentBatches.statementToken })
      .from(paymentBatches)
      .where(eq(paymentBatches.id, batchId))
    statementToken = row?.statementToken ?? null
  } catch (error) {
    console.error("payments: swallowed fallback error", error)
    statementToken = null
  }

  const payments = await db
    .select({
      id: partnerPayments.id,
      pricingModel: partnerPayments.pricingModel,
      quantity: partnerPayments.quantity,
      unitPrice: partnerPayments.unitPrice,
      totalAmount: partnerPayments.totalAmount,
      status: partnerPayments.status,
      createdAt: partnerPayments.createdAt,
      partnerTaskId: partnerPayments.partnerTaskId,
      requestId: partnerTasks.requestId,
      requestNumber: requests.requestNumber,
    })
    .from(partnerPayments)
    .leftJoin(partnerTasks, eq(partnerPayments.partnerTaskId, partnerTasks.id))
    .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
    .where(eq(partnerPayments.batchId, batchId))
    .orderBy(desc(partnerPayments.createdAt))

  return { batch: { ...batch, statementToken }, payments }
}

// ─── Intervention queue ───────────────────────────────────────────────────────
// Everything that is stuck waiting on an Ops decision, deliberately UNFILTERED
// by date: the whole point is to surface the backlog that a month-scoped view
// like /admin/payments/review structurally cannot show. Three distinct stalls:
//   1. awaitingSignoff — tasks parked at pending_signoff/failed, no decision yet
//   2. unpaidClosed    — task closed, no payment row, no deliberate none/hold
//                        decision either (usually a missing partner contract:
//                        sign-off records the decision but skips the payment)
//   3. stalePayments   — payment approved but never batched, aging past the SLA
// Only (1) is visible anywhere in the UI today; (2) is entirely silent.

const STALE_PAYMENT_DAYS = 14

export type InterventionQueue = {
  key: "awaitingSignoff" | "unpaidClosed" | "stalePayments"
  count: number
  oldestAt: number | null
  partners: string[]
  href: string
}

export async function getPaymentInterventions(): Promise<InterventionQueue[]> {
  const session = await getStaffSession()
  if (!session) return []

  const staleCutoff = Date.now() - STALE_PAYMENT_DAYS * 86_400_000

  const [awaitingSignoff, unpaidClosed, stalePayments] = await Promise.all([
    // Supplier pickups close via warehouse receipt, never via sign-off, so they
    // can never sit in this queue — mirrors the canSignOff gate on the tasks page.
    db
      .select({
        partnerName: partners.name,
        count: count(partnerTasks.id),
        oldestAt: sql<number | null>`MIN(COALESCE(${partnerTasks.completedAt}, ${partnerTasks.assignedAt}))`,
      })
      .from(partnerTasks)
      .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .where(
        and(
          inArray(partnerTasks.status, ["pending_signoff", "failed"]),
          notInArray(partnerTasks.kind, ["supplier_pickup"])
        )
      )
      .groupBy(partners.name),

    db
      .select({
        partnerName: partners.name,
        count: count(partnerTasks.id),
        oldestAt: sql<number | null>`MIN(${partnerTasks.closedAt})`,
      })
      .from(partnerTasks)
      .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .leftJoin(partnerPayments, eq(partnerPayments.partnerTaskId, partnerTasks.id))
      .leftJoin(partnerPaymentDecisions, eq(partnerPaymentDecisions.partnerTaskId, partnerTasks.id))
      .where(
        and(
          eq(partnerTasks.status, "closed"),
          notInArray(partnerTasks.kind, ["supplier_pickup"]),
          sql`${partnerPayments.id} IS NULL`,
          // A recorded "none"/"hold" is a deliberate call, not a stall.
          sql`COALESCE(${partnerPaymentDecisions.decision}, '') NOT IN ('none', 'hold')`
        )
      )
      .groupBy(partners.name),

    db
      .select({
        partnerName: partners.name,
        count: count(partnerPayments.id),
        oldestAt: sql<number | null>`MIN(${partnerPayments.createdAt})`,
      })
      .from(partnerPayments)
      .leftJoin(partners, eq(partnerPayments.partnerId, partners.id))
      .where(
        and(
          inArray(partnerPayments.status, ["pending", "on_hold"]),
          lte(partnerPayments.createdAt, staleCutoff)
        )
      )
      .groupBy(partners.name),
  ])

  type Row = { partnerName: string | null; count: number; oldestAt: number | null }

  const fold = (key: InterventionQueue["key"], rows: Row[], href: string): InterventionQueue => ({
    key,
    count: rows.reduce((sum, row) => sum + row.count, 0),
    oldestAt: rows.reduce<number | null>(
      (oldest, row) =>
        row.oldestAt === null ? oldest : oldest === null ? row.oldestAt : Math.min(oldest, row.oldestAt),
      null
    ),
    partners: rows
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((row) => `${row.partnerName ?? "—"} (${row.count})`),
    href,
  })

  return [
    fold("awaitingSignoff", awaitingSignoff, "/admin/partners/tasks?status=pending_signoff"),
    fold("unpaidClosed", unpaidClosed, "/admin/partners/tasks?status=closed"),
    fold("stalePayments", stalePayments, "/admin/payments/review"),
  ].filter((queue) => queue.count > 0)
}

// ─── Get partners + months with pending payments (for generate form) ──────────

export async function getPartnersWithPendingPayments() {
  const session = await getStaffSession()
  if (!session) return []

  // Business-month offset is admin-configurable (Settings → Pricing &
  // Payments) — otherwise a sign-off right after local midnight can land in
  // the wrong month's batch depending on the operating timezone.
  const offset = await getBusinessMonthOffsetModifier()

  return db
    .select({
      partnerId: partnerPayments.partnerId,
      partnerName: partners.name,
      period: sql<string>`strftime('%Y-%m', datetime(${partnerPayments.createdAt}/1000, 'unixepoch', ${offset}))`,
      totalAmount: sql<number>`COALESCE(SUM(${partnerPayments.totalAmount}), 0)`,
      paymentCount: count(partnerPayments.id),
    })
    .from(partnerPayments)
    .leftJoin(partners, eq(partnerPayments.partnerId, partners.id))
    .where(eq(partnerPayments.status, "pending"))
    .groupBy(
      partnerPayments.partnerId,
      partners.name,
      sql`strftime('%Y-%m', datetime(${partnerPayments.createdAt}/1000, 'unixepoch', ${offset}))`
    )
    .orderBy(partners.name)
}

export async function updatePaymentLine(
  paymentId: string,
  formData: FormData
): Promise<PaymentActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const totalAmount = Number.parseFloat(String(formData.get("totalAmount") ?? ""))
  if (!Number.isFinite(totalAmount) || totalAmount < 0) return { error: "Invalid amount" }
  const notes = String(formData.get("notes") ?? "").trim() || null
  const financeServiceType = String(formData.get("financeServiceType") ?? "").trim() || undefined
  const financeServiceDescription = String(formData.get("financeServiceDescription") ?? "").trim() || undefined

  const [payment] = await db.select().from(partnerPayments).where(eq(partnerPayments.id, paymentId))
  if (!payment) return { error: "Not found" }
  if (payment.status === "paid") return { error: "Paid items cannot be edited" }

  if (payment.batchId) {
    const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, payment.batchId))
    if (batch && batch.status !== "draft") {
      return { error: "Only draft batch items can be edited" }
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(partnerPayments)
      .set({
        totalAmount,
        unitPrice: payment.quantity > 0 ? totalAmount / payment.quantity : totalAmount,
        notes: serializeFinanceNotes({ financeServiceType, financeServiceDescription, notes: notes ?? undefined }),
        updatedAt: Date.now(),
      })
      .where(eq(partnerPayments.id, paymentId))

    if (payment.batchId) await recalcBatchTotal(tx, payment.batchId)

    await logActivity(
      {
        entityType: payment.batchId ? "payment_batch" : "partner_task",
        entityId: payment.batchId ?? payment.partnerTaskId,
        action: "payment_line_updated",
        i18nKey: "activity.paymentLineUpdated",
        i18nData: {
          paymentId,
          from: payment.totalAmount,
          to: totalAmount,
          notes: notes ?? "",
        },
        performedBy: session.user.id,
      },
      tx
    )
  })

  if (payment.batchId) revalidatePath(`/admin/payments/${payment.batchId}`)
  revalidatePath("/admin/payments")
  revalidatePath("/admin/payments/review")
  revalidatePath("/admin/payments/finance-report")
  return { id: paymentId }
}

// ─── Flexible payment review ─────────────────────────────────────────────────

export async function getPaymentReview(filters: PaymentReviewFilters = {}) {
  const session = await getStaffSession()
  if (!session) return { partners: [], summary: [], payments: [] }

  const fromTs = parseDateStart(filters.from)
  const toTs = parseDateEnd(filters.to)
  const partnerIds = (filters.partnerIds ?? []).filter(Boolean)

  const conditions = [
    fromTs ? gte(partnerPayments.createdAt, fromTs) : undefined,
    toTs ? lte(partnerPayments.createdAt, toTs) : undefined,
    partnerIds.length > 0 ? inArray(partnerPayments.partnerId, partnerIds) : undefined,
  ].filter(Boolean)

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const partnerList = await db
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(eq(partners.status, "active"))
    .orderBy(partners.name)

  const summaryRows = await db
    .select({
      partnerId: partnerPayments.partnerId,
      partnerName: partners.name,
      paymentCount: count(partnerPayments.id),
      pendingTotal: sql<number>`COALESCE(SUM(CASE WHEN ${partnerPayments.status} = 'pending' THEN ${partnerPayments.totalAmount} ELSE 0 END), 0)`,
      batchedTotal: sql<number>`COALESCE(SUM(CASE WHEN ${partnerPayments.status} = 'batched' THEN ${partnerPayments.totalAmount} ELSE 0 END), 0)`,
      paidTotal: sql<number>`COALESCE(SUM(CASE WHEN ${partnerPayments.status} = 'paid' THEN ${partnerPayments.totalAmount} ELSE 0 END), 0)`,
      heldTotal: sql<number>`COALESCE(SUM(CASE WHEN ${partnerPayments.status} = 'on_hold' THEN ${partnerPayments.totalAmount} ELSE 0 END), 0)`,
      totalAmount: sql<number>`COALESCE(SUM(${partnerPayments.totalAmount}), 0)`,
    })
    .from(partnerPayments)
    .leftJoin(partners, eq(partnerPayments.partnerId, partners.id))
    .where(whereClause)
    .groupBy(partnerPayments.partnerId, partners.name)
    .orderBy(partners.name)

  const paymentRows = await db
    .select({
      id: partnerPayments.id,
      partnerId: partnerPayments.partnerId,
      partnerName: partners.name,
      status: partnerPayments.status,
      pricingModel: partnerPayments.pricingModel,
      quantity: partnerPayments.quantity,
      unitPrice: partnerPayments.unitPrice,
      totalAmount: partnerPayments.totalAmount,
      createdAt: partnerPayments.createdAt,
      requestId: partnerTasks.requestId,
      requestNumber: requests.requestNumber,
      quoteNumber: requests.quoteNumber,
      customerName: customers.name,
      serviceType: requestTypes.nameEn,
      serviceDescription: sql<string>`COALESCE(
        (
          SELECT group_concat(${servicesCatalog.nameEn}, ', ')
          FROM ${taskServices}
          LEFT JOIN ${servicesCatalog} ON ${taskServices.serviceId} = ${servicesCatalog.id}
          WHERE ${taskServices.partnerTaskId} = ${partnerTasks.id}
        ),
        CASE
          WHEN ${requests.origin} IS NOT NULL OR ${requests.destination} IS NOT NULL
          THEN 'from ' || COALESCE(${requests.origin}, '-') || ' to ' || COALESCE(${requests.destination}, '-')
          ELSE ${requests.notes}
        END,
        ''
      )`,
      serialNumber: sql<string>`COALESCE(
        (
          SELECT group_concat(NULLIF(${requestItems.serialNumber}, ''), ', ')
          FROM ${requestItems}
          WHERE ${requestItems.requestId} = ${requests.id}
        ),
        ''
      )`,
      deviceSpecs: sql<string>`COALESCE(
        (
          SELECT group_concat(
            trim(
              COALESCE(${requestItems.description}, '') || ' ' ||
              COALESCE(${requestItems.brand}, '') || ' ' ||
              COALESCE(${requestItems.model}, '')
            ),
            ', '
          )
          FROM ${requestItems}
          WHERE ${requestItems.requestId} = ${requests.id}
        ),
        ''
      )`,
      rawNotes: partnerPayments.notes,
      batchId: partnerPayments.batchId,
    })
    .from(partnerPayments)
    .leftJoin(partners, eq(partnerPayments.partnerId, partners.id))
    .leftJoin(partnerTasks, eq(partnerPayments.partnerTaskId, partnerTasks.id))
    .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
    .leftJoin(customers, eq(requests.customerId, customers.id))
    .leftJoin(requestTypes, eq(requests.typeId, requestTypes.id))
    .where(whereClause)
    .orderBy(desc(partnerPayments.createdAt))
    .limit(500)

  const payments = paymentRows.map((payment) => {
    const parsedNotes = parseFinanceNotes(payment.rawNotes)
    return {
      ...payment,
      serviceType: parsedNotes.financeServiceType || payment.serviceType,
      serviceDescription: parsedNotes.financeServiceDescription || payment.serviceDescription,
      notes: parsedNotes.notes ?? null,
    }
  })

  return { partners: partnerList, summary: summaryRows, payments }
}

// ─── Generate batch ───────────────────────────────────────────────────────────

export async function generateBatch(
  partnerId: string,
  period: string
): Promise<PaymentActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsedPeriod = periodSchema.safeParse(period)
  if (!parsedPeriod.success) return { error: firstError(parsedPeriod.error) }
  if (!partnerId) return { error: "Partner is required" }

  const batchId = createId()
  let totalAmount = 0
  const offset = await getBusinessMonthOffsetModifier()

  try {
    await db.transaction(async (tx) => {
      // Re-check for an open batch and select pending payments inside the same
      // transaction so two concurrent generateBatch calls can't both pass the
      // check and both claim the same payments (financial double-batching).
      const [openBatch] = await tx
        .select()
        .from(paymentBatches)
        .where(
          and(
            eq(paymentBatches.partnerId, partnerId),
            eq(paymentBatches.period, period),
            notInArray(paymentBatches.status, ["paid"])
          )
        )
      if (openBatch) throw new Error("OPEN_BATCH_EXISTS")

      const payments = await tx
        .select()
        .from(partnerPayments)
        .where(
          and(
            eq(partnerPayments.partnerId, partnerId),
            eq(partnerPayments.status, "pending"),
            eq(
              sql`strftime('%Y-%m', datetime(${partnerPayments.createdAt}/1000, 'unixepoch', ${offset}))`,
              period
            )
          )
        )
      if (payments.length === 0) throw new Error("NO_PENDING_PAYMENTS")

      totalAmount = payments.reduce((s, p) => s + p.totalAmount, 0)

      await tx.insert(paymentBatches).values({
        id: batchId,
        partnerId,
        period,
        totalAmount,
        status: "draft",
      })

      await tx
        .update(partnerPayments)
        .set({ batchId, status: "batched", updatedAt: Date.now() })
        .where(inArray(partnerPayments.id, payments.map((p) => p.id)))

      await logActivity(
        {
          entityType: "payment_batch",
          entityId: batchId,
          action: "batch_generated",
          i18nKey: "activity.batchGenerated",
          i18nData: { count: payments.length, total: totalAmount, period },
          performedBy: session.user.id,
        },
        tx
      )

      await emitDomainEvent(tx, {
        aggregateType: "payment_batch",
        aggregateId: batchId,
        eventType: "PaymentBatchGenerated",
        payload: { partnerId, period, totalAmount, paymentCount: payments.length },
        dedupeKey: `payment_batch:${batchId}:PaymentBatchGenerated`,
        actorUserId: session.user.id,
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "OPEN_BATCH_EXISTS") {
      return { error: "An open batch already exists for this partner and period" }
    }
    if (error instanceof Error && error.message === "NO_PENDING_PAYMENTS") {
      return { error: "No pending payments for this partner and period" }
    }
    throw error
  }

  // Set the statement token separately + tolerantly: the statement_token column
  // may not exist yet on an un-migrated DB, and it must not block batch creation.
  try {
    await db
      .update(paymentBatches)
      .set({ statementToken: generateSecureToken() })
      .where(eq(paymentBatches.id, batchId))
  } catch (error) {
    console.error("payments: swallowed fallback error", error)
    // column not migrated yet — statement link simply unavailable until it is
  }

  revalidatePath("/admin/payments")
  return { id: batchId }
}

// ─── Batch status transitions ─────────────────────────────────────────────────

export async function approveBatch(batchId: string): Promise<PaymentActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batchId))
  if (!batch) return { error: "Not found" }
  if (batch.status !== "draft") return { error: "Only draft batches can be approved" }

  try {
    await db.transaction(async (tx) => {
    assertChanged(await tx
      .update(paymentBatches)
      .set({ status: "approved", approvedBy: session.user.id, approvedAt: Date.now() })
      .where(and(eq(paymentBatches.id, batchId), eq(paymentBatches.status, "draft"))))
    await logActivity(
      {
        entityType: "payment_batch",
        entityId: batchId,
        action: "batch_approved",
        i18nKey: "activity.batchApproved",
        performedBy: session.user.id,
      },
      tx
    )
    await emitDomainEvent(tx, {
      aggregateType: "payment_batch",
      aggregateId: batchId,
      eventType: "PaymentBatchApproved",
      payload: { partnerId: batch.partnerId, totalAmount: batch.totalAmount },
      dedupeKey: `payment_batch:${batchId}:PaymentBatchApproved`,
      actorUserId: session.user.id,
    })
    })
  } catch (e) {
    if (e instanceof StaleStatusError) return { error: "Only draft batches can be approved" }
    throw e
  }

  revalidatePath(`/admin/payments/${batchId}`)
  revalidatePath("/admin/payments")
  return { id: batchId }
}

export async function markBatchSentToFinance(batchId: string): Promise<PaymentActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batchId))
  if (!batch) return { error: "Not found" }
  if (batch.status !== "approved") return { error: "Only approved batches can be sent to finance" }

  try {
    await db.transaction(async (tx) => {
    assertChanged(await tx
      .update(paymentBatches)
      .set({ status: "sent_to_finance", sentAt: Date.now() })
      .where(and(eq(paymentBatches.id, batchId), eq(paymentBatches.status, "approved"))))
    await logActivity(
      {
        entityType: "payment_batch",
        entityId: batchId,
        action: "batch_sent_to_finance",
        i18nKey: "activity.batchSentToFinance",
        performedBy: session.user.id,
      },
      tx
    )
    await emitDomainEvent(tx, {
      aggregateType: "payment_batch",
      aggregateId: batchId,
      eventType: "PaymentBatchSent",
      payload: { partnerId: batch.partnerId, totalAmount: batch.totalAmount },
      dedupeKey: `payment_batch:${batchId}:PaymentBatchSent`,
      actorUserId: session.user.id,
    })
    })
  } catch (e) {
    if (e instanceof StaleStatusError) return { error: "Only approved batches can be sent to finance" }
    throw e
  }

  revalidatePath(`/admin/payments/${batchId}`)
  revalidatePath("/admin/payments")
  return { id: batchId }
}

export async function markBatchPaid(batchId: string): Promise<PaymentActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batchId))
  if (!batch) return { error: "Not found" }
  if (batch.status !== "sent_to_finance") return { error: "Only sent batches can be marked as paid" }

  try {
    await db.transaction(async (tx) => {
    assertChanged(await tx
      .update(paymentBatches)
      .set({ status: "paid", paidAt: Date.now() })
      .where(and(eq(paymentBatches.id, batchId), eq(paymentBatches.status, "sent_to_finance"))))

    // Held line items are disputed — do not mark them paid; they roll to a later batch
    await tx
      .update(partnerPayments)
      .set({ status: "paid", updatedAt: Date.now() })
      .where(and(eq(partnerPayments.batchId, batchId), eq(partnerPayments.status, "batched")))

    await logActivity(
      {
        entityType: "payment_batch",
        entityId: batchId,
        action: "batch_paid",
        i18nKey: "activity.batchPaid",
        i18nData: { total: batch.totalAmount },
        performedBy: session.user.id,
      },
      tx
    )
    await emitDomainEvent(tx, {
      aggregateType: "payment_batch",
      aggregateId: batchId,
      eventType: "PaymentBatchPaid",
      payload: { partnerId: batch.partnerId, totalAmount: batch.totalAmount },
      dedupeKey: `payment_batch:${batchId}:PaymentBatchPaid`,
      actorUserId: session.user.id,
    })
    })
  } catch (e) {
    if (e instanceof StaleStatusError) return { error: "Only sent batches can be marked as paid" }
    throw e
  }

  revalidatePath(`/admin/payments/${batchId}`)
  revalidatePath("/admin/payments")
  return { id: batchId }
}

// ─── Line-item holds ──────────────────────────────────────────────────────────
// A disputed payment is pulled OUT of its batch (back to on_hold, unbatched) so
// the rest of the batch can be paid; the held item can be re-batched later.

export async function holdPayment(paymentId: string, reason?: string): Promise<PaymentActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [payment] = await db.select().from(partnerPayments).where(eq(partnerPayments.id, paymentId))
  if (!payment) return { error: "Not found" }
  if (payment.status === "paid") return { error: "Paid items cannot be held" }
  if (payment.status === "on_hold") return { id: paymentId } // already held — idempotent no-op

  const formerBatchId = payment.batchId
  const fromStatus = payment.status

  try {
    await db.transaction(async (tx) => {
    // Guard on the status we read: a concurrent hold/release/pay that already
    // moved this payment makes this a no-op (0 rows) → abort, no duplicate event.
    assertChanged(await tx
      .update(partnerPayments)
      .set({
        status: "on_hold",
        batchId: null,
        updatedAt: Date.now(),
        ...(reason !== undefined ? { notes: reason } : {}),
      })
      .where(and(eq(partnerPayments.id, paymentId), eq(partnerPayments.status, fromStatus))))

    // OI-0: recompute the former batch's total so the held amount stops counting.
    if (formerBatchId) {
      await recalcBatchTotal(tx, formerBatchId)
      await logActivity(
        {
          entityType: "payment_batch",
          entityId: formerBatchId,
          action: "payment_held",
          i18nKey: "activity.paymentHeld",
          i18nData: {
            paymentId,
            amount: payment.totalAmount,
            fromStatus,
            toStatus: "on_hold",
            reason: reason ?? "",
          },
          performedBy: session.user.id,
        },
        tx
      )
    }

    await emitDomainEvent(tx, {
      aggregateType: "partner_payment",
      aggregateId: paymentId,
      eventType: "PaymentHeld",
      payload: { fromStatus, toStatus: "on_hold", reason: reason ?? null },
      dedupeKey: `partner_payment:${paymentId}:PaymentHeld:${createId()}`,
      actorUserId: session.user.id,
    })
    })
  } catch (e) {
    if (e instanceof StaleStatusError) return { error: "Paid items cannot be held" }
    throw e
  }

  if (formerBatchId) revalidatePath(`/admin/payments/${formerBatchId}`)
  revalidatePath("/admin/payments")
  return { id: paymentId }
}

export async function releasePayment(paymentId: string, reason?: string): Promise<PaymentActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [payment] = await db.select().from(partnerPayments).where(eq(partnerPayments.id, paymentId))
  if (!payment) return { error: "Not found" }
  if (payment.status !== "on_hold") return { error: "Only held items can be released" }

  try {
    await db.transaction(async (tx) => {
    // Back to pending so it gets picked up by the next batch generation for its period
    assertChanged(await tx
      .update(partnerPayments)
      .set({
        status: "pending",
        updatedAt: Date.now(),
        ...(reason !== undefined ? { notes: reason } : {}),
      })
      .where(and(eq(partnerPayments.id, paymentId), eq(partnerPayments.status, "on_hold"))))
    await logActivity(
      {
        entityType: "payment_batch",
        entityId: paymentId,
        action: "payment_released",
        i18nKey: "activity.paymentReleased",
        i18nData: {
          paymentId,
          amount: payment.totalAmount,
          fromStatus: "on_hold",
          toStatus: "pending",
          reason: reason ?? "",
        },
        performedBy: session.user.id,
      },
      tx
    )

    await emitDomainEvent(tx, {
      aggregateType: "partner_payment",
      aggregateId: paymentId,
      eventType: "PaymentReleased",
      payload: { fromStatus: "on_hold", toStatus: "pending", reason: reason ?? null },
      dedupeKey: `partner_payment:${paymentId}:PaymentReleased:${createId()}`,
      actorUserId: session.user.id,
    })
    })
  } catch (e) {
    if (e instanceof StaleStatusError) return { error: "Only held items can be released" }
    throw e
  }

  revalidatePath("/admin/payments")
  return { id: paymentId }
}

// ─── Public: partner statement by token ───────────────────────────────────────

export async function getBatchByStatementToken(token: string) {
  if (!checkRateLimit(`statement:${token}`, 30)) return null
  let batch
  try {
    ;[batch] = await db
      .select({
        id: paymentBatches.id,
        period: paymentBatches.period,
        totalAmount: paymentBatches.totalAmount,
        status: paymentBatches.status,
        generatedAt: paymentBatches.generatedAt,
        paidAt: paymentBatches.paidAt,
        partnerName: partners.name,
      })
      .from(paymentBatches)
      .leftJoin(partners, eq(paymentBatches.partnerId, partners.id))
      .where(eq(paymentBatches.statementToken, token))
  } catch (error) {
    console.error("payments: swallowed fallback error", error)
    // statement_token column not migrated yet
    return null
  }

  if (!batch) return null

  const payments = await db
    .select({
      id: partnerPayments.id,
      pricingModel: partnerPayments.pricingModel,
      quantity: partnerPayments.quantity,
      unitPrice: partnerPayments.unitPrice,
      totalAmount: partnerPayments.totalAmount,
      status: partnerPayments.status,
      createdAt: partnerPayments.createdAt,
      requestNumber: requests.requestNumber,
    })
    .from(partnerPayments)
    .leftJoin(partnerTasks, eq(partnerPayments.partnerTaskId, partnerTasks.id))
    .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
    .where(eq(partnerPayments.batchId, batch.id))
    .orderBy(desc(partnerPayments.createdAt))

  return { batch, payments }
}
