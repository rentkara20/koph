import Link from "next/link"
import { ArrowLeft, ExternalLink, Plus, Search } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getAdminTasks, getTaskFilterOptions, type AdminTaskKindFilter } from "@/lib/actions/ad-hoc-partner-tasks"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils/format"
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

const STATUS_FILTERS = ["pending", "accepted", "in_progress", "pending_signoff", "closed", "rejected", "failed", "cancelled"]

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function kindLabel(kind: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (kind === "ad_hoc") return t("adHocTaskLabel")
  if (kind === "supplier_pickup") return t("pickup.title")
  return t("requestTaskLabel")
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const kind = (one(params.kind) as AdminTaskKindFilter | undefined) ?? "all"
  const partnerId = one(params.partnerId) ?? ""
  // Opens on the tasks the office actually has to act on. "all" is the explicit
  // opt-out so an absent param stays distinguishable from a deliberate "any
  // status" choice.
  const status = one(params.status) ?? "pending_signoff"
  const date = one(params.date) ?? ""

  const [tasks, filterOptions, t, tStatus, tReason, tCommon] = await Promise.all([
    getAdminTasks({ kind, partnerId, status: status === "all" ? "" : status, date }),
    getTaskFilterOptions(),
    getTranslations("tasks"),
    getTranslations("tasks.status"),
    getTranslations("tasks.adHocReason"),
    getTranslations("common"),
  ])

  const tabHref = (nextKind: AdminTaskKindFilter) => {
    const next = new URLSearchParams()
    if (nextKind !== "all") next.set("kind", nextKind)
    if (partnerId) next.set("partnerId", partnerId)
    if (status) next.set("status", status)
    if (date) next.set("date", date)
    return `/admin/partners/tasks${next.size ? `?${next.toString()}` : ""}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/partners" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <Link href="/admin/partners/tasks/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          {t("adHocNewButton")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "request", "ad_hoc"] as const).map((value) => (
          <Link
            key={value}
            href={tabHref(value)}
            className={cn(
              buttonVariants({ variant: kind === value ? "default" : "outline", size: "sm" }),
              "min-w-28"
            )}
          >
            {value === "all" ? t("filterAll") : value === "request" ? t("filterRequestTasks") : t("filterGeneralTasks")}
          </Link>
        ))}
      </div>

      <form className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4" action="/admin/partners/tasks">
        {kind !== "all" && <input type="hidden" name="kind" value={kind} />}
        <Select name="partnerId" defaultValue={partnerId} aria-label={t("partner")}>
          <option value="">{t("filterAnyPartner")}</option>
          {filterOptions.partners.map((partner) => (
            <option key={partner.id} value={partner.id}>{partner.name}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} aria-label={tCommon("status")}>
          <option value="all">{t("filterAnyStatus")}</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{tStatus(s as never)}</option>
          ))}
        </Select>
        <Input name="date" type="date" defaultValue={date} aria-label={t("scheduledDate")} />
        <button className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")} type="submit">
          <Search className="size-4" />
          {t("filterApply")}
        </button>
      </form>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const canSignOff = task.kind !== "supplier_pickup" && (task.status === "pending_signoff" || task.status === "failed")
            const title = task.kind === "ad_hoc" ? task.adHocTitle : task.requestNumber
            const plannedAt = task.scheduledAt ?? task.requestDeliveryDate
            const timeWindow = task.timeWindow ?? task.requestTimeWindow
            const requestType = task.requestTypeNameEn || task.requestTypeNameAr

            return (
              <div key={task.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{title ?? "—"}</span>
                      <Badge variant="outline">{kindLabel(task.kind, t)}</Badge>
                      <Badge variant={STATUS_VARIANT[task.status] ?? "secondary"}>{tStatus(task.status as never)}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {task.partnerName ?? "—"}
                      {task.kind === "ad_hoc" && task.adHocReason ? ` · ${tReason(task.adHocReason as never)}` : ""}
                      {requestType ? ` · ${requestType}` : ""}
                      {task.contactName ? ` · ${task.contactName}` : ""}
                      {task.contactCity ? ` · ${task.contactCity}` : ""}
                      {task.destinationLocation ? ` · ${task.destinationLocation}` : ""}
                      {plannedAt ? ` · ${formatDate(plannedAt)}` : ""}
                      {timeWindow ? ` · ${timeWindow}` : ""}
                    </p>
                    <Link
                      href={`/task/${task.taskToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      {t("taskWorkflowLink")}
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
