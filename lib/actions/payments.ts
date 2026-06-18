"use server"

import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  partners,
  partnerPayments,
  partnerTasks,
  paymentBatches,
  requests,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSession } from "@/lib/auth/session"

export type PaymentActionResult = { error?: string; id?: string }

// ─── Get all payment batches ──────────────────────────────────────────────────

export async function getPaymentBatches() {
  const session = await getSession()
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
  const session = await getSession()
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

  return { batch, payments }
}

// ─── Get partners + months with pending payments (for generate form) ──────────

export async function getPartnersWithPendingPayments() {
  const session = await getSession()
  if (!session) return []

  return db
    .select({
      partnerId: partnerPayments.partnerId,
      partnerName: partners.name,
      period: sql<string>`strftime('%Y-%m', datetime(${partnerPayments.createdAt}/1000, 'unixepoch'))`,
      totalAmount: sql<number>`COALESCE(SUM(${partnerPayments.totalAmount}), 0)`,
      paymentCount: count(partnerPayments.id),
    })
    .from(partnerPayments)
    .leftJoin(partners, eq(partnerPayments.partnerId, partners.id))
    .where(eq(partnerPayments.status, "pending"))
    .groupBy(
      partnerPayments.partnerId,
      partners.name,
      sql`strftime('%Y-%m', datetime(${partnerPayments.createdAt}/1000, 'unixepoch'))`
    )
    .orderBy(partners.name)
}

// ─── Generate batch ───────────────────────────────────────────────────────────

export async function generateBatch(
  partnerId: string,
  period: string
): Promise<PaymentActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [existing] = await db
    .select()
    .from(paymentBatches)
    .where(and(eq(paymentBatches.partnerId, partnerId), eq(paymentBatches.period, period)))

  if (existing) return { error: "A batch already exists for this partner and period" }

  const payments = await db
    .select()
    .from(partnerPayments)
    .where(
      and(
        eq(partnerPayments.partnerId, partnerId),
        eq(partnerPayments.status, "pending"),
        eq(
          sql`strftime('%Y-%m', datetime(${partnerPayments.createdAt}/1000, 'unixepoch'))`,
          period
        )
      )
    )

  if (payments.length === 0)
    return { error: "No pending payments for this partner and period" }

  const totalAmount = payments.reduce((s, p) => s + p.totalAmount, 0)
  const batchId = createId()

  await db.insert(paymentBatches).values({
    id: batchId,
    partnerId,
    period,
    totalAmount,
    status: "draft",
  })

  await db
    .update(partnerPayments)
    .set({ batchId, status: "batched", updatedAt: Date.now() })
    .where(inArray(partnerPayments.id, payments.map((p) => p.id)))

  revalidatePath("/admin/payments")
  return { id: batchId }
}

// ─── Batch status transitions ─────────────────────────────────────────────────

export async function approveBatch(batchId: string): Promise<PaymentActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batchId))
  if (!batch) return { error: "Not found" }
  if (batch.status !== "draft") return { error: "Only draft batches can be approved" }

  await db
    .update(paymentBatches)
    .set({ status: "approved", approvedBy: session.user.id, approvedAt: Date.now() })
    .where(eq(paymentBatches.id, batchId))

  revalidatePath(`/admin/payments/${batchId}`)
  revalidatePath("/admin/payments")
  return { id: batchId }
}

export async function markBatchSentToFinance(batchId: string): Promise<PaymentActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batchId))
  if (!batch) return { error: "Not found" }
  if (batch.status !== "approved") return { error: "Only approved batches can be sent to finance" }

  await db
    .update(paymentBatches)
    .set({ status: "sent_to_finance", sentAt: Date.now() })
    .where(eq(paymentBatches.id, batchId))

  revalidatePath(`/admin/payments/${batchId}`)
  revalidatePath("/admin/payments")
  return { id: batchId }
}

export async function markBatchPaid(batchId: string): Promise<PaymentActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batchId))
  if (!batch) return { error: "Not found" }
  if (batch.status !== "sent_to_finance") return { error: "Only sent batches can be marked as paid" }

  await db
    .update(paymentBatches)
    .set({ status: "paid", paidAt: Date.now() })
    .where(eq(paymentBatches.id, batchId))

  await db
    .update(partnerPayments)
    .set({ status: "paid", updatedAt: Date.now() })
    .where(eq(partnerPayments.batchId, batchId))

  revalidatePath(`/admin/payments/${batchId}`)
  revalidatePath("/admin/payments")
  return { id: batchId }
}
