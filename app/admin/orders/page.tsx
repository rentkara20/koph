import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { FileSpreadsheet, Plus, Search } from "lucide-react"
import { getOrders } from "@/lib/actions/orders"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { orderStatusVariant } from "@/lib/utils/order-status"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const [t, tCommon, tImportExport, orderList] = await Promise.all([
    getTranslations("orders"),
    getTranslations("common"),
    getTranslations("importExport"),
    getOrders(q),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/settings/import-export?module=order"
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          >
            <FileSpreadsheet className="size-4" />
            {tImportExport("linkLabel")}
          </Link>
          <Link href="/admin/orders/new" className={cn(buttonVariants(), "gap-1.5")}>
            <Plus className="size-4" />
            {t("new")}
          </Link>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          className="flex h-9 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        />
      </form>

      {/* List */}
      {orderList.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-2 sm:hidden">
            {orderList.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders/${o.id}`}
                className="block rounded-lg border p-4 active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{o.orderNumber}</span>
                  <Badge variant={orderStatusVariant[o.status] ?? "outline"}>
                    {t(`status.${o.status}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{o.customerName ?? "—"}</p>
                {o.deviceCount > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {o.firstDevice}
                    {o.deviceCount > 1 && ` +${o.deviceCount - 1}`} · {o.totalQuantity} {t("unitsCount")}
                  </p>
                )}
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden rounded-lg border overflow-hidden sm:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("orderNumber")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden lg:table-cell">{t("quoteDate")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("customer")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t("devices")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{tCommon("status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orderList.map((o) => (
                  <tr key={o.id} className="relative hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-medium font-mono after:absolute after:inset-0"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {o.quoteDate ? formatDate(o.quoteDate) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${o.customerId}`}
                        className="relative z-10 text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {o.customerName ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {o.deviceCount > 0 ? (
                        <>
                          {o.firstDevice}
                          {o.deviceCount > 1 && ` +${o.deviceCount - 1}`}
                          <span className="text-xs"> · {o.totalQuantity} {t("unitsCount")}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={orderStatusVariant[o.status] ?? "outline"}>
                        {t(`status.${o.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
