import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { orderStatusVariant } from "@/lib/utils/order-status"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"
import { JourneyBar } from "./journey-bar"
import { NextActionButton } from "./next-action-button"

// Sticky mission-control header: request identity, 9-stage journey, owner +
// blocker line, and the highest-urgency next action per active track.
export async function WorkspaceHeader({ workspace }: { workspace: RequestWorkspace }) {
  const [t, tOrders] = await Promise.all([
    getTranslations("workspace"),
    getTranslations("orders"),
  ])
  const { order, customer, journey, primaryActions } = workspace
  const itemCount = workspace.lines.reduce((acc, l) => acc + l.quantity, 0)
  const blocked = primaryActions.find((a) => a.blockedBy)

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href="/admin/orders"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          aria-label={tOrders("title")}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
        <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl" dir="ltr">
          {order.orderNumber}
        </h1>
        <Badge variant={orderStatusVariant[order.status] ?? "outline"}>
          {tOrders(`status.${order.status}`)}
        </Badge>
        <p className="w-full truncate text-sm text-muted-foreground sm:w-auto sm:flex-1">
          {customer?.name ?? "—"} · {t("itemCount", { count: itemCount })}
          {order.rentalPeriodMonths
            ? ` · ${t("rentalPeriod", { months: order.rentalPeriodMonths })}`
            : ""}
          {workspace.rentalEndAt ? ` (${t("rentalEnds", { date: formatDate(workspace.rentalEndAt) })})` : ""}
        </p>
      </div>

      <div className="mt-3">
        <JourneyBar stages={journey} />
      </div>

      {(primaryActions.length > 0 || blocked) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {blocked && (
            <p className="me-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              {t("blockerLine", { blocker: t(`blockers.${blocked.blockedBy}`) })}
            </p>
          )}
          {primaryActions.map((action) => (
            <div key={action.key} className="flex items-center gap-1.5">
              <span className="hidden text-[11px] uppercase tracking-wide text-muted-foreground sm:inline">
                {t(`roles.${action.ownerRole}`)}
              </span>
              <NextActionButton action={action} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
