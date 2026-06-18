import Link from "next/link"
import { getDashboardStats } from "@/lib/actions/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react"

export default async function DashboardPage() {
  const stats = await getDashboardStats()

  if (!stats) return null

  const cards = [
    {
      title: "Active requests",
      value: stats.activeRequests,
      description: "Currently in progress",
      icon: Loader2,
      href: "/admin/requests?status=in_progress",
      color: "text-blue-600",
    },
    {
      title: "Pending sign-off",
      value: stats.pendingSignoff,
      description: "Tasks waiting for your approval",
      icon: Clock,
      href: "/admin/requests?status=in_progress",
      color: stats.pendingSignoff > 0 ? "text-amber-600" : "text-muted-foreground",
    },
    {
      title: "Overdue deliveries",
      value: stats.overdueDeliveries,
      description: "Assigned but past delivery date",
      icon: AlertTriangle,
      href: "/admin/requests?status=assigned",
      color: stats.overdueDeliveries > 0 ? "text-destructive" : "text-muted-foreground",
    },
    {
      title: "Completed",
      value: stats.completedToday,
      description: "Total completed requests",
      icon: CheckCircle2,
      href: "/admin/requests?status=completed",
      color: "text-green-600",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Operations overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.title} href={card.href}>
              <Card className="hover:bg-muted/30 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <Icon className={`size-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-bold tabular-nums ${card.color}`}>
                    {card.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        More widgets coming soon — recent activity, partner performance, upcoming deliveries.
      </div>
    </div>
  )
}
