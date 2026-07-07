import { eq, and, isNull, inArray, lt, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { maintenanceOrders, partnerTasks, requests, users } from "@/lib/db/schema"
import { sendEmail } from "@/lib/email/resend"
import { weeklySummaryEmail } from "@/lib/email/templates"

// Weekly ops digest for every admin. Not user-facing — triggered by Vercel
// Cron (see vercel.json) with a shared secret so it can't be hit publicly.
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
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

  await Promise.all(admins.filter((a) => a.email).map((a) => sendEmail({ to: a.email!, subject, html })))

  return Response.json({ sentTo: admins.length })
}
