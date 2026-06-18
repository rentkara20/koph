"use server"

import { eq, and, isNull, count, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { requests, partnerTasks } from "@/lib/db/schema"
import { getSession } from "@/lib/auth/session"

export async function getDashboardStats() {
  const session = await getSession()
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
