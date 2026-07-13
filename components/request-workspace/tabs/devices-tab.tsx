import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Devices: every unit in the family (order-origin + PO-origin) with serial,
// tag, status and location. Rows link to the asset detail page.
export async function DevicesTab({ workspace }: { workspace: RequestWorkspace }) {
  const [t, tAssets] = await Promise.all([
    getTranslations("workspace"),
    getTranslations("assets"),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("tabs.devices")}</CardTitle>
      </CardHeader>
      <CardContent>
        {workspace.units.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("devices.none")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {workspace.units.map((u) => (
              <li
                key={u.id}
                className="relative flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/assets/${u.id}`}
                    className="text-sm font-medium after:absolute after:inset-0"
                  >
                    {u.description}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {[u.assetTag, u.serialNumber].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {u.location}
                  </span>
                  <Badge variant="outline">
                    {u.status === "receiving_qc"
                      ? t("devices.receivingQc")
                      : tAssets.has(`statuses.${u.status}`)
                        ? tAssets(`statuses.${u.status}`)
                        : u.status}
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
