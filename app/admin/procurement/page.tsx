import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getPurchaseOrders } from "@/lib/actions/procurement"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils/format"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  ordered: "default",
  partially_received: "warning",
  received: "success",
  cancelled: "destructive",
}

export default async function ProcurementPage() {
  const [t, pos] = await Promise.all([getTranslations("procurement"), getPurchaseOrders()])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href="/admin/procurement/new"
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("createPo")}
        </Link>
      </div>

      {pos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPurchaseOrders")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3">{t("poNumber")}</th>
                <th className="p-3">{t("supplier")}</th>
                <th className="p-3">{t("invoiceRef")}</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-3">
                    <Link href={`/admin/procurement/${po.id}`} className="font-medium hover:underline">
                      {po.poNumber}
                    </Link>
                  </td>
                  <td className="p-3">{po.supplierName}</td>
                  <td className="p-3">{po.invoiceRef ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[po.status] ?? "secondary"}>
                      {t(`statuses.${po.status}` as never)}
                    </Badge>
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
