import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getDashboardStats, getWorkQueue } from "@/lib/actions/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  FileSignature,
  ChevronRight,
  Inbox,
} from "lucide-react"

export default async function DashboardPage() {
  const [stats, queue, t] = await Promise.all([
    getDashboardStats(),
    getWorkQueue(),
    getTranslations("dashboard"),
  ])

  if (!stats) return null

  const cards = [
    {
      title: t("activeRequests"),
      value: stats.activeRequests,
      description: t("activeRequestsDesc"),
      icon: Loader2,
      href: "/admin/requests?status=in_progress",
      color: "text-kara-blue",
    },
    {
      title: t("pendingSignoff"),
      value: stats.pendingSignoff,
      description: t("pendingSignoffDesc"),
      icon: Clock,
      href: "#signoff-queue",
      color: stats.pendingSignoff > 0 ? "text-amber-600" : "text-muted-foreground",
    },
    {
      title: t("overdue"),
      value: stats.overdueDeliveries,
      description: t("overdueDesc"),
      icon: AlertTriangle,
      href: "#overdue-queue",
      color: stats.overdueDeliveries > 0 ? "text-destructive" : "text-muted-foreground",
    },
    {
      title: t("completed"),
      value: stats.completedToday,
      description: t("completedDesc"),
      icon: CheckCircle2,
      href: "/admin/requests?status=completed",
      color: "text-green-600",
    },
  ]

  const totalQueue =
    (queue?.pendingSignoff.length ?? 0) +
    (queue?.overdue.length ?? 0) +
    (queue?.pendingSignatures.length ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.title} href={card.href}>
              <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <Icon className={`size-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Work queue — what needs attention now */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("needsAttention")}</h2>

        {totalQueue === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <Inbox className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">{t("queueEmpty")}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Sign-off queue */}
            <Card id="signoff-queue" className="scroll-mt-20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-amber-600" />
                  {t("signoffQueue")}
                  <span className="ms-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {queue?.pendingSignoff.length ?? 0}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {queue?.pendingSignoff.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">—</p>
                ) : (
                  queue?.pendingSignoff.map((row) => (
                    <Link
                      key={row.taskId}
                      href={`/admin/requests/${row.requestId}`}
                      className="group flex items-center gap-2 rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.requestNumber ?? "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.customerName ?? "—"}
                          {row.partnerName ? ` · ${t("byPartner")} ${row.partnerName}` : ""}
                        </p>
                      </div>
                      <span className="hidden shrink-0 text-xs font-medium text-primary group-hover:inline">
                        {t("reviewAndSignoff")}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Overdue queue */}
            <Card id="overdue-queue" className="scroll-mt-20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4 text-destructive" />
                  {t("overdueQueue")}
                  <span className="ms-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                    {queue?.overdue.length ?? 0}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {queue?.overdue.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">—</p>
                ) : (
                  queue?.overdue.map((row) => (
                    <Link
                      key={row.id}
                      href={`/admin/requests/${row.id}`}
                      className="group flex items-center gap-2 rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.requestNumber}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.customerName ?? "—"}
                          {row.deliveryDate
                            ? ` · ${t("dueColon")} ${formatDate(row.deliveryDate)}`
                            : ""}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Signature queue */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSignature className="size-4 text-kara-blue" />
                  {t("signatureQueue")}
                  <span className="ms-auto rounded-full bg-kara-blue-soft px-2 py-0.5 text-xs font-medium text-kara-purple">
                    {queue?.pendingSignatures.length ?? 0}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {queue?.pendingSignatures.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">—</p>
                ) : (
                  queue?.pendingSignatures.map((row) => (
                    <Link
                      key={row.id}
                      href={row.requestId ? `/admin/requests/${row.requestId}` : "/admin/signatures"}
                      className="group flex items-center gap-2 rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.documentName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.customerName ?? "—"}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  )
}
