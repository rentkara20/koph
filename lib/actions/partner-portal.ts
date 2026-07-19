"use server"

import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  partnerPayments,
  partners,
  partnerTasks,
  paymentBatches,
  requests,
} from "@/lib/db/schema"
import { getSession } from "@/lib/auth/session"

// All reads in this file are scoped to the partner row linked to the logged-in
// user (partners.userId = session.user.id). A partner can never pass a foreign
// partnerId — it is always resolved server-side from the session.

async function getMyPartner() {
  const session = await getSession()
  if (!session || session.user.role !== "partner") return null
  const [partner] = await db
    .select()
    .from(partners)
    .where(eq(partners.userId, session.user.id))
  return partner ?? null
}

export async function getMyPartnerProfile() {
  return getMyPartner()
}

export async function getMyTasks() {
  const partner = await getMyPartner()
  if (!partner) return null

  const rows = await db
    .select({
      id: partnerTasks.id,
      kind: partnerTasks.kind,
      status: partnerTasks.status,
      taskToken: partnerTasks.taskToken,
      taskTokenExpiresAt: partnerTasks.taskTokenExpiresAt,
      createdAt: partnerTasks.createdAt,
      notes: partnerTasks.notes,
      // ad_hoc display context (null for request/pickup kinds).
      adHocTitle: partnerTasks.adHocTitle,
      adHocReason: partnerTasks.adHocReason,
      destinationLocation: partnerTasks.destinationLocation,
      requestNumber: requests.requestNumber,
      customerName: customers.name,
      deliveryDate: requests.deliveryDate,
      city: customers.city,
    })
    .from(partnerTasks)
    .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
    .leftJoin(customers, eq(requests.customerId, customers.id))
    .where(eq(partnerTasks.partnerId, partner.id))
    .orderBy(desc(partnerTasks.createdAt))
    .limit(200)

  return { partner, tasks: rows }
}

export async function getMyEarnings() {
  const partner = await getMyPartner()
  if (!partner) return null

  const [totals] = await db
    .select({
      pendingTotal: sql<number>`coalesce(sum(case when ${partnerPayments.status} in ('pending','batched') then ${partnerPayments.totalAmount} else 0 end), 0)`,
      paidTotal: sql<number>`coalesce(sum(case when ${partnerPayments.status} = 'paid' then ${partnerPayments.totalAmount} else 0 end), 0)`,
      heldTotal: sql<number>`coalesce(sum(case when ${partnerPayments.status} = 'on_hold' then ${partnerPayments.totalAmount} else 0 end), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(partnerPayments)
    .where(eq(partnerPayments.partnerId, partner.id))

  const recent = await db
    .select({
      id: partnerPayments.id,
      totalAmount: partnerPayments.totalAmount,
      quantity: partnerPayments.quantity,
      unitPrice: partnerPayments.unitPrice,
      status: partnerPayments.status,
      createdAt: partnerPayments.createdAt,
      requestNumber: requests.requestNumber,
    })
    .from(partnerPayments)
    .leftJoin(partnerTasks, eq(partnerPayments.partnerTaskId, partnerTasks.id))
    .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
    .where(eq(partnerPayments.partnerId, partner.id))
    .orderBy(desc(partnerPayments.createdAt))
    .limit(100)

  return { partner, totals, recent }
}

export async function getMyStatements() {
  const partner = await getMyPartner()
  if (!partner) return null

  const batches = await db
    .select({
      id: paymentBatches.id,
      period: paymentBatches.period,
      totalAmount: paymentBatches.totalAmount,
      status: paymentBatches.status,
      generatedAt: paymentBatches.generatedAt,
      paidAt: paymentBatches.paidAt,
      statementToken: paymentBatches.statementToken,
    })
    .from(paymentBatches)
    .where(
      and(eq(paymentBatches.partnerId, partner.id), isNotNull(paymentBatches.statementToken))
    )
    .orderBy(desc(paymentBatches.generatedAt))

  return { partner, batches }
}
