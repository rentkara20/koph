import { getTranslations } from "next-intl/server"
import { FileText, PenLine } from "lucide-react"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"

// Documents: signature requests (delivery notes) + uploaded attachments
// across the whole family (jobs, tasks, signatures, purchase orders).
export async function DocumentsTab({ workspace }: { workspace: RequestWorkspace }) {
  const [t, tSignatures] = await Promise.all([
    getTranslations("workspace"),
    getTranslations("signatures"),
  ])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("documents.signatures")}</CardTitle>
        </CardHeader>
        <CardContent>
          {workspace.signatures.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("documents.noSignatures")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {workspace.signatures.map((sig) => (
                <li
                  key={sig.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <PenLine className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{sig.documentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`documents.signatoryRole.${sig.signatoryRole}`)} ·{" "}
                        {formatDate(sig.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={sig.status === "signed" ? "default" : "outline"}>
                    {tSignatures(`status.${sig.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("documents.attachments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {workspace.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("documents.noAttachments")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {workspace.attachments.map((file) => (
                <li
                  key={file.id}
                  className="relative flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <a
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-medium after:absolute after:inset-0"
                    >
                      {file.fileName}
                    </a>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t(`documents.entity.${file.entityType}`)} · {formatDate(file.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
