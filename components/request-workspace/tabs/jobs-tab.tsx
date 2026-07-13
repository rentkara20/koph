import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Badge, requestStatusVariant } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"

// Jobs: field work (delivery/collection/…) that pulled units from this
// request, with partner + latest task status.
export async function JobsTab({ workspace }: { workspace: RequestWorkspace }) {
  const [t, tRequests, tTasks, locale] = await Promise.all([
    getTranslations("workspace"),
    getTranslations("requests"),
    getTranslations("tasks"),
    getLocale(),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("tabs.jobs")}</CardTitle>
      </CardHeader>
      <CardContent>
        {workspace.jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("jobs.none")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {workspace.jobs.map((job) => (
              <li
                key={job.id}
                className="relative flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/requests/${job.id}`}
                      className="font-mono font-medium after:absolute after:inset-0"
                      dir="ltr"
                    >
                      {job.requestNumber}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {(locale === "ar" ? job.typeNameAr : job.typeName) ?? "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("jobs.itemCount", { count: job.itemCount })}
                    {job.partnerName ? ` · ${job.partnerName}` : ""}
                    {job.taskStatus ? ` · ${tTasks(`status.${job.taskStatus}`)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {formatDate(job.createdAt)}
                  </span>
                  <Badge variant={requestStatusVariant[job.status] ?? "outline"}>
                    {tRequests(`status.${job.status}`)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
