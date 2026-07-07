import { timingSafeEqual } from "crypto"
import { eq, and, isNull, inArray, lt, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { maintenanceOrders, partnerTasks, requests, users } from "@/lib/db/schema"
import { sendEmail } from "@/lib/email/resend"
import { weeklySummaryEmail } from "@/lib/email/templates"
import { pruneOldNotifications } from "@/lib/actions/notifications"
import { isWeeklyDigestEnabled } from "@/lib/actions/settings"

function isAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

// Weekly ops digest for every admin. Not user-facing — triggered by Vercel
// Cron (see vercel.json) with a shared secret so it can't be hit publicly.
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  // Pruning runs regardless of the digest toggle — retention shouldn't depend
  // on whether admins want the email.
  const { deleted } = await pruneOldNotifications()

  if (!(await isWeeklyDigestEnabled())) {
    return Response.json({ sentTo: 0, notificationsPruned: deleted, digestDisabled: true })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [[overdue], [maintenanceOpen], [pendingSignoff], admins] = await Promise.all([
    db
      .select({ n: count() })
      .from(requests)
      .where(
        and(
          isNull(requests.deletedAt),
          lt(requests.deliveryDate, today.getTime()),
          inArray(requests.status, ["assigned", "in_progress"])
        )
      ),
    db.select({ n: count() }).from(maintenanceOrders).where(eq(maintenanceOrders.status, "open")),
    db.select({ n: count() }).from(partnerTasks).where(eq(partnerTasks.status, "pending_signoff")),
    db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), isNull(users.deletedAt))),
  ])

  const { subject, html } = weeklySummaryEmail({
    overdueCount: overdue?.n ?? 0,
    maintenanceOpenCount: maintenanceOpen?.n ?? 0,
    pendingSignoffCount: pendingSignoff?.n ?? 0,
    dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/dashboard`,
  })

  // allSettled — one bad address must not sink the rest of the digest
  await Promise.allSettled(admins.filter((a) => a.email).map((a) => sendEmail({ to: a.email!, subject, html })))

  return Response.json({ sentTo: admins.length, notificationsPruned: deleted })
}
