"use server"

import { eq, and, isNull, count, lt, desc, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { requests, partnerTasks, partners, customers, signatureRequests } from "@/lib/db/schema"
import { getStaffSession } from "@/lib/auth/session"

export async function getDashboardStats() {
  const session = await getStaffSession()
  if (!session) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTs = today.getTime()

  const [
    activeRequests,
    pendingSignoff,
    overdueDeliveries,
    completedToday,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(requests)
      .where(
        and(
          isNull(requests.deletedAt),
          eq(requests.status, "in_progress")
        )
      ),
    db
      .select({ count: count() })
      .from(partnerTasks)
      .where(eq(partnerTasks.status, "pending_signoff")),
    db
      .select({ count: count() })
      .from(requests)
      .where(
        and(
          isNull(requests.deletedAt),
          lt(requests.deliveryDate, todayTs),
          eq(requests.status, "assigned")
        )
      ),
    db
      .select({ count: count() })
      .from(requests)
      .where(
        and(
          isNull(requests.deletedAt),
          eq(requests.status, "completed"),
          lt(requests.updatedAt, todayTs + 86400000)
        )
      ),
  ])

  return {
    activeRequests: activeRequests[0]?.count ?? 0,
    pendingSignoff: pendingSignoff[0]?.count ?? 0,
    overdueDeliveries: overdueDeliveries[0]?.count ?? 0,
    completedToday: completedToday[0]?.count ?? 0,
  }
}

// Actionable work queue for the dashboard — the "what needs me now" list that
// replaces the stat-cards-only landing screen.
export async function getWorkQueue() {
  const session = await getStaffSession()
  if (!session) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTs = today.getTime()

  const [pendingSignoff, overdue, pendingSignatures] = await Promise.all([
    // Tasks the office must review and sign off
    db
      .select({
        taskId: partnerTasks.id,
        requestId: partnerTasks.requestId,
        requestNumber: requests.requestNumber,
        partnerName: partners.name,
        customerName: customers.name,
        since: partnerTasks.completedAt,
      })
      .from(partnerTasks)
      .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
      .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .leftJoin(customers, eq(requests.customerId, customers.id))
      .where(and(eq(partnerTasks.status, "pending_signoff"), isNull(requests.deletedAt)))
      .orderBy(desc(partnerTasks.completedAt))
      .limit(25),
    // Assigned requests already past their delivery date
    db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        customerName: customers.name,
        deliveryDate: requests.deliveryDate,
      })
      .from(requests)
      .leftJoin(customers, eq(requests.customerId, customers.id))
      .where(
        and(
          isNull(requests.deletedAt),
          lt(requests.deliveryDate, todayTs),
          inArray(requests.status, ["assigned", "in_progress"])
        )
      )
      .orderBy(requests.deliveryDate)
      .limit(25),
    // Signature requests sent/opened but not yet signed
    db
      .select({
        id: signatureRequests.id,
        requestId: signatureRequests.requestId,
        documentName: signatureRequests.documentName,
        customerName: customers.name,
        status: signatureRequests.status,
        since: signatureRequests.updatedAt,
      })
      .from(signatureRequests)
      .leftJoin(customers, eq(signatureRequests.customerId, customers.id))
      .where(inArray(signatureRequests.status, ["sent", "opened"]))
      .orderBy(desc(signatureRequests.updatedAt))
      .limit(25),
  ])

  return { pendingSignoff, overdue, pendingSignatures }
}
