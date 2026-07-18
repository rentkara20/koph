import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { getSerializedProductsForSale } from "@/lib/actions/products"
import { getAccessoryItems, getAccessoryStock, getAccessoryUnits } from "@/lib/actions/accessories"
import { Badge } from "@/components/ui/badge"
import { ASSET_STATUS_VARIANT } from "@/app/admin/assets/status-variant"
import { AccessoriesManager } from "@/app/admin/accessories/_components/accessories-manager"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FileSpreadsheet } from "lucide-react"

// Products for Sale (kind = "sale"): items whose ownership transfers to the
// customer. Serialized sold units live in order_unit(kind=sale) and appear in
// the table below; non-serialized quantity stock stays in the qty-stock tables
// and is managed by the shared stock manager. Serialization does NOT decide the
// bucket — the Assets page (kind=rental) is the counterpart for rental units.
export default async function ProductsForSalePage() {
  const [t, tAssets, serialized, items, stock, units] = await Promise.all([
    getTranslations("products"),
    getTranslations("assets"),
    getSerializedProductsForSale(),
    getAccessoryItems(),
    getAccessoryStock(),
    getAccessoryUnits(),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href="/admin/settings/import-export?module=productForSale"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <FileSpreadsheet className="size-3.5" />
          {t("exportData")}
        </Link>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">{t("serializedTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("serializedHint")}</p>
        </div>

        {serialized.assets.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("emptySerialized")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{tAssets("assetTag")}</th>
                  <th className="px-3 py-2 text-start font-medium">{tAssets("device")}</th>
                  <th className="px-3 py-2 text-start font-medium">{tAssets("serial")}</th>
                  <th className="px-3 py-2 text-start font-medium">{tAssets("status")}</th>
                  <th className="px-3 py-2 text-start font-medium">{tAssets("customer")}</th>
                </tr>
              </thead>
              <tbody>
                {serialized.assets.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 font-mono">
                      <Link href={`/admin/assets/${a.id}`} className="hover:underline">
                        {a.assetTag ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{a.description}</td>
                    <td className="px-3 py-2 font-mono">{a.serialNumber ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={ASSET_STATUS_VARIANT[a.status] ?? "outline"}>
                        {tAssets(`statuses.${a.status}`)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{a.currentCustomerName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("stockTitle")}</h2>
        <AccessoriesManager items={items} stock={stock} units={units} />
      </section>
    </div>
  )
}
