import { getTranslations } from "next-intl/server"
import { getMaintenanceOrders } from "@/lib/actions/maintenance"
import { formatDate } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { MaintenanceRowActions } from "./_components/maintenance-row-actions"

const STATUS_VARIANT: Record<string, "outline" | "info" | "success" | "secondary"> = {
  open: "outline",
  in_progress: "info",
  done: "success",
  cancelled: "secondary",
}

export default async function MaintenancePage() {
  const [t, tCommon, orders] = await Promise.all([
    getTranslations("maintenance"),
    getTranslations("common"),
    getMaintenanceOrders(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("asset")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("issue")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("status")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">{t("cost")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">{t("opened")}</th>
                <th className="px-4 py-2.5 text-end font-medium text-muted-foreground">{tCommon("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-semibold text-kara-purple" dir="ltr">
                      {o.assetTag ?? o.serialNumber ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 max-w-xs truncate">{o.issue}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[o.status] ?? "outline"}>
                      {t(`statuses.${o.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell tabular-nums">
                    {o.cost != null ? o.cost.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground">
                    {formatDate(o.openedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-end">
                    <MaintenanceRowActions id={o.id} status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
