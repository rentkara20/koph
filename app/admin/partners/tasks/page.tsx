import Link from "next/link"
import { ArrowLeft, Plus, ExternalLink } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getAdHocTasks } from "@/lib/actions/ad-hoc-partner-tasks"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { AdHocSignOffButton } from "./_components/sign-off-button"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  pending: "secondary",
  accepted: "default",
  in_progress: "default",
  pending_signoff: "warning",
  closed: "success",
  rejected: "secondary",
  failed: "destructive",
  cancelled: "secondary",
}

export default async function AdHocTasksPage() {
  const [tasks, t, tStatus, tReason, tCommon] = await Promise.all([
    getAdHocTasks(),
    getTranslations("tasks"),
    getTranslations("tasks.status"),
    getTranslations("tasks.adHocReason"),
    getTranslations("common"),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/partners" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{t("adHocListTitle")}</h1>
        </div>
        <Link href="/admin/partners/tasks/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          {t("adHocNewButton")}
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const canSignOff = task.status === "pending_signoff" || task.status === "failed"
            return (
              <div key={task.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{task.adHocTitle}</span>
                      <Badge variant={STATUS_VARIANT[task.status] ?? "secondary"}>{tStatus(task.status)}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {task.partnerName ?? "—"}
                      {task.adHocReason ? ` · ${tReason(task.adHocReason)}` : ""}
                      {task.destinationLocation ? ` · ${task.destinationLocation}` : ""}
                    </p>
                    <Link
                      href={`/task/${task.taskToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      {t("adHocTaskLink")}
                    </Link>
                  </div>
                  {canSignOff && (
                    <div className="shrink-0">
                      <AdHocSignOffButton
                        taskId={task.id}
                        pricingModel={task.pricingModel}
                        unitPrice={task.unitPrice}
                        isOverride={task.status === "failed"}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
