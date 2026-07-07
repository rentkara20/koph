import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ChevronLeft } from "lucide-react"
import { getMyTasks } from "@/lib/actions/partner-portal"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils/format"
import { TASK_STATUS_VARIANT } from "../task-status-variant"

export default async function PartnerTasksPage() {
  const [t, tStatus, data] = await Promise.all([
    getTranslations("partnerPortal"),
    getTranslations("tasks.status"),
    getMyTasks(),
  ])

  if (!data) redirect("/login")

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{t("allTasks")}</h1>

      {data.tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {t("noTasks")}
        </div>
      ) : (
        <ul className="space-y-2">
          {data.tasks.map((task) => {
            const expired = task.taskTokenExpiresAt < Date.now()
            const closed = ["done", "cancelled", "rejected", "failed"].includes(task.status)
            const inner = (
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{task.customerName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono" dir="ltr">{task.requestNumber ?? ""}</span>
                    {task.city ? ` · ${task.city}` : ""}
                    {task.deliveryDate ? ` · ${formatDate(task.deliveryDate)}` : ""}
                  </p>
                  {expired && !closed && (
                    <p className="mt-0.5 text-xs text-destructive">{t("expiredLink")}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={TASK_STATUS_VARIANT[task.status] ?? "outline"}>
                    {tStatus(task.status as never)}
                  </Badge>
                  {!expired && (
                    <ChevronLeft className="size-4 text-muted-foreground ltr:rotate-180" aria-hidden />
                  )}
                </div>
              </div>
            )
            return (
              <li key={task.id}>
                {expired ? inner : <Link href={`/task/${task.taskToken}`}>{inner}</Link>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
