import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getDashboardStats } from "@/lib/actions/dashboard"
import { getInbox, type InboxCard, type InboxOwner } from "@/lib/actions/inbox"
import { rankOwnerInbox, type InboxUrgency } from "@/lib/domain/owner-inbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronRight,
  Inbox,
  ClipboardCheck,
  PackageSearch,
  Warehouse,
  Coins,
} from "lucide-react"

const OWNER_ICON: Record<InboxOwner, typeof Inbox> = {
  operations: ClipboardCheck,
  procurement: PackageSearch,
  warehouse: Warehouse,
  finance: Coins,
}

function waitingLabel(
  since: number | null,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  if (!since) return ""
  const days = Math.max(0, Math.floor((Date.now() - since) / 86400000))
  return days === 0 ? t("waitingToday") : t("waitingDays", { days })
}

export default async function DashboardPage() {
  const [stats, inbox, t, ti] = await Promise.all([
    getDashboardStats(),
    getInbox(),
    getTranslations("dashboard"),
    getTranslations("dashboard.inbox"),
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
      href: "#owner-inbox",
      color: stats.pendingSignoff > 0 ? "text-amber-600" : "text-muted-foreground",
    },
    {
      title: t("overdue"),
      value: stats.overdueDeliveries,
      description: t("overdueDesc"),
      icon: AlertTriangle,
      href: "#owner-inbox",
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

  const sections = inbox ?? []
  const rankedCards = rankOwnerInbox(sections.flatMap((section) => section.cards))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ti("inboxTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{ti("inboxSubtitle")}</p>
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

      {rankedCards.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">{t("queueEmpty")}</p>
        </div>
      ) : (
        <Card id="owner-inbox" className="scroll-mt-20 overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="size-5 text-kara-blue" />
              {ti("needsYourAction")}
              <span className="ms-auto rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                {rankedCards.length}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{ti("priorityHint")}</p>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {rankedCards.map(({ card, urgency }) => (
              <InboxRow key={card.key} card={card} urgency={urgency} ti={ti} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function InboxRow({
  card,
  urgency,
  ti,
}: {
  card: InboxCard
  urgency: InboxUrgency
  ti: (key: string, values?: Record<string, string | number>) => string
}) {
  const waiting = waitingLabel(card.since, ti)
  const OwnerIcon = OWNER_ICON[card.owner]
  const ownerKey = `owner${card.owner.charAt(0).toUpperCase()}${card.owner.slice(1)}`
  const urgencyStyle: Record<InboxUrgency, string> = {
    urgent: "bg-red-50 text-red-700 border-red-200",
    high: "bg-amber-50 text-amber-700 border-amber-200",
    normal: "bg-muted text-muted-foreground border-border",
  }
  return (
    <Link
      href={card.href}
      className="group flex items-center gap-3 px-4 py-4 hover:bg-accent transition-colors sm:px-5"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border ${urgencyStyle[urgency]}`}>
        <OwnerIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${urgencyStyle[urgency]}`}>
            {ti(`urgency.${urgency}`)}
          </span>
          <span className="text-[10px] text-muted-foreground">{ti(ownerKey)}</span>
        </div>
        <p className="truncate text-sm font-semibold">
          <span>{card.requestRef}</span>
          {card.customerName ? ` · ${card.customerName}` : ""}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {ti(card.waitingKey)}
          {waiting ? ` · ${waiting}` : ""}
        </p>
        {card.blockerKey ? (
          <p className="truncate text-xs font-medium text-amber-600">{ti(card.blockerKey)}</p>
        ) : null}
      </div>
      <span className="hidden shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground sm:inline">
        {ti(card.actionKey)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
    </Link>
  )
}
