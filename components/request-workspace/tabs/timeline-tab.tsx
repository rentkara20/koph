import { getTranslations } from "next-intl/server"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime } from "@/lib/utils/format"

// Timeline: merged activity_log rows across the whole family (jobs, tasks,
// signatures, purchase orders), newest first, capped server-side. Keys are
// humanized the same way the field-request detail page renders them.
function humanize(i18nKey: string): string {
  return i18nKey
    .replace(/^activity\./, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\./g, " · ")
    .trim()
}

export async function TimelineTab({ workspace }: { workspace: RequestWorkspace }) {
  const t = await getTranslations("workspace")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("tabs.timeline")}</CardTitle>
      </CardHeader>
      <CardContent>
        {workspace.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("timeline.none")}</p>
        ) : (
          <ol className="space-y-0">
            {workspace.timeline.map((entry, i) => (
              <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-kara-purple" aria-hidden />
                  {i < workspace.timeline.length - 1 && (
                    <span className="w-px flex-1 bg-border" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-sm capitalize">{humanize(entry.i18nKey)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`timeline.entity.${entry.entityType}`)} · {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
