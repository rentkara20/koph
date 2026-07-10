"use server"

import { count, desc, eq, sql, sum } from "drizzle-orm"
import { db } from "@/lib/db"
import { orderLines, orderUnits, purchaseOrderLines, partners, partnerPayments, partnerTasks, paymentBatches, requests } from "@/lib/db/schema"
import { getStaffSession } from "@/lib/auth/session"

// ─── Inventory: on-hand counts by location and model ─────────────────────────

export async function getInventoryByLocation() {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({ location: orderUnits.location, status: orderUnits.status, count: count() })
    .from(orderUnits)
    .groupBy(orderUnits.location, orderUnits.status)
    .orderBy(orderUnits.location)
}

export async function getInventoryByModel() {
  const session = await getStaffSession()
  if (!session) return []

  // COALESCE across both origins so procurement-minted assets (orderLineId
  // NULL) are counted here too — an INNER JOIN on orderLineId dropped them,
  // making this report disagree with getInventoryByLocation on fleet size.
  const brandCol = sql<string | null>`coalesce(${orderLines.brand}, ${purchaseOrderLines.brand})`
  const modelCol = sql<string | null>`coalesce(${orderLines.model}, ${purchaseOrderLines.model})`
  return db
    .select({
      brand: brandCol,
      model: modelCol,
      status: orderUnits.status,
      count: count(),
    })
    .from(orderUnits)
    .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .leftJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
    .groupBy(brandCol, modelCol, orderUnits.status)
    .orderBy(desc(count()))
    .limit(100)
}

// ─── Requests by status ───────────────────────────────────────────────────────

export async function getRequestsByStatus() {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({ status: requests.status, count: count() })
    .from(requests)
    .groupBy(requests.status)
    .orderBy(requests.status)
}

// ─── Partner task performance ─────────────────────────────────────────────────

export async function getPartnerPerformance() {
  const session = await getStaffSession()
  if (!session) return []

  const rows = await db
    .select({
      partnerId: partnerTasks.partnerId,
      partnerName: partners.name,
      status: partnerTasks.status,
      count: count(),
    })
    .from(partnerTasks)
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .groupBy(partnerTasks.partnerId, partners.name, partnerTasks.status)
    .orderBy(partners.name)

  const ACTIVE = ["pending", "accepted", "in_progress", "pending_signoff"]

  const map = new Map<
    string,
    { name: string; total: number; closed: number; failed: number; active: number }
  >()

  for (const row of rows) {
    if (!map.has(row.partnerId)) {
      map.set(row.partnerId, { name: row.partnerName ?? "—", total: 0, closed: 0, failed: 0, active: 0 })
    }
    const p = map.get(row.partnerId)!
    p.total += row.count
    if (row.status === "closed") p.closed += row.count
    else if (row.status === "failed") p.failed += row.count
    else if (ACTIVE.includes(row.status)) p.active += row.count
  }

  return Array.from(map.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total)
}

// ─── Payment summary by month ─────────────────────────────────────────────────

export async function getPaymentSummaryByMonth() {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({
      period: paymentBatches.period,
      status: paymentBatches.status,
      totalAmount: sql<number>`COALESCE(SUM(${paymentBatches.totalAmount}), 0)`,
      batchCount: count(),
    })
    .from(paymentBatches)
    .groupBy(paymentBatches.period, paymentBatches.status)
    .orderBy(desc(paymentBatches.period))
}

// ─── Pending payments summary ─────────────────────────────────────────────────

export async function getPendingPaymentsSummary() {
  const session = await getStaffSession()
  if (!session) return { pendingCount: 0, pendingTotal: 0 }

  const [row] = await db
    .select({
      pendingCount: count(),
      pendingTotal: sql<number>`COALESCE(SUM(${partnerPayments.totalAmount}), 0)`,
    })
    .from(partnerPayments)
    .where(eq(partnerPayments.status, "pending"))

  return row ?? { pendingCount: 0, pendingTotal: 0 }
}
