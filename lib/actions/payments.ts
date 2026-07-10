"use server"

import { and, count, desc, eq, inArray, notInArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  partners,
  partnerPayments,
  partnerTasks,
  paymentBatches,
  requests,
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

  await db.transaction(async (tx) => {
    await tx
      .update(paymentBatches)
      .set({ status: "approved", approvedBy: session.user.id, approvedAt: Date.now() })
      .where(eq(paymentBatches.id, batchId))
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

  await db.transaction(async (tx) => {
    await tx
      .update(paymentBatches)
      .set({ status: "sent_to_finance", sentAt: Date.now() })
      .where(eq(paymentBatches.id, batchId))
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

  await db.transaction(async (tx) => {
    await tx
      .update(paymentBatches)
      .set({ status: "paid", paidAt: Date.now() })
      .where(eq(paymentBatches.id, batchId))

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

  const formerBatchId = payment.batchId
  const fromStatus = payment.status

  await db.transaction(async (tx) => {
    await tx
      .update(partnerPayments)
      .set({
        status: "on_hold",
        batchId: null,
        updatedAt: Date.now(),
        ...(reason !== undefined ? { notes: reason } : {}),
      })
      .where(eq(partnerPayments.id, paymentId))

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
  })

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

  await db.transaction(async (tx) => {
    // Back to pending so it gets picked up by the next batch generation for its period
    await tx
      .update(partnerPayments)
      .set({
        status: "pending",
        updatedAt: Date.now(),
        ...(reason !== undefined ? { notes: reason } : {}),
      })
      .where(eq(partnerPayments.id, paymentId))
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
  })

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
