import Link from "next/link"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ArrowLeft, ClipboardList, Clock, Coins, PauseCircle } from "lucide-react"
import { getMyEarnings, getMyTasks } from "@/lib/actions/partner-portal"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils/format"
import { TASK_STATUS_VARIANT } from "./task-status-variant"

export default async function PartnerOverviewPage() {
  const [t, tStatus, locale, earnings, tasksData] = await Promise.all([
    getTranslations("partnerPortal"),
    getTranslations("tasks.status"),
    getLocale(),
    getMyEarnings(),
    getMyTasks(),
  ])

  // Logged in as partner role but no partner record linked yet.
  if (!earnings || !tasksData) redirect("/login")

  const money = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
  })

  const activeTasks = tasksData.tasks.filter((task) =>
    ["sent", "accepted", "in_progress", "pending_signoff"].includes(task.status)
  )

  const cards = [
    {
      key: "pending",
      label: t("pendingEarnings"),
      value: money.format(earnings.totals.pendingTotal),
      icon: Clock,
      tone: "text-kara-blue",
    },
    {
      key: "paid",
      label: t("paidEarnings"),
      value: money.format(earnings.totals.paidTotal),
      icon: Coins,
      tone: "text-kara-purple",
    },
    ...(earnings.totals.heldTotal > 0
      ? [
          {
            key: "held",
            label: t("heldEarnings"),
            value: money.format(earnings.totals.heldTotal),
            icon: PauseCircle,
            tone: "text-amber-600",
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t("welcome", { name: earnings.partner.name })}</h1>
        <p className="text-sm text-muted-foreground">{t("overviewSubtitle")}</p>
      </div>

      {/* Earnings cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ key, label, value, icon: Icon, tone }) => (
          <div key={key} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={`size-3.5 ${tone}`} aria-hidden />
              {label}
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Active tasks */}
      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardList className="size-4 text-kara-purple" aria-hidden />
            {t("activeTasks")} ({activeTasks.length})
          </h2>
          <Link href="/partner/tasks" className="flex items-center gap-1 text-xs text-kara-purple hover:underline">
            {t("viewAll")}
            <ArrowLeft className="size-3 ltr:rotate-180" aria-hidden />
          </Link>
        </header>
        {activeTasks.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noActiveTasks")}</p>
        ) : (
          <ul className="divide-y">
            {activeTasks.slice(0, 5).map((task) => (
              <li key={task.id}>
                <Link
                  href={`/task/${task.taskToken}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.customerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono" dir="ltr">{task.requestNumber ?? ""}</span>
                      {task.deliveryDate ? ` · ${formatDate(task.deliveryDate)}` : ""}
                    </p>
                  </div>
                  <Badge variant={TASK_STATUS_VARIANT[task.status] ?? "outline"}>
                    {tStatus(task.status as never)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
