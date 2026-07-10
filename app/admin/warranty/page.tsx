import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getWarrantyCenter, getWarrantyProducts } from "@/lib/actions/warranty"
import { getPurchaseOrders } from "@/lib/actions/procurement"
import { Badge } from "@/components/ui/badge"
import { WarrantySetup } from "./_components/warranty-setup"

const BUCKETS = [
  { key: "purchasedNotAssigned", variant: "secondary" as const },
  { key: "assignedNotActivated", variant: "warning" as const },
  { key: "activationOverdue", variant: "destructive" as const },
  { key: "active", variant: "success" as const },
  { key: "expiringSoon", variant: "warning" as const },
  { key: "expired", variant: "destructive" as const },
  { key: "certificateMissing", variant: "destructive" as const },
] as const

export default async function WarrantyCenterPage() {
  const [t, center, products, purchaseOrders] = await Promise.all([
    getTranslations("warranty"),
    getWarrantyCenter(),
    getWarrantyProducts(),
    getPurchaseOrders(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BUCKETS.map(({ key, variant }) => {
          const items = (center?.[key as keyof NonNullable<typeof center>] ?? []) as { id: string; assetId?: string }[]
          return (
            <div key={key} className="rounded-xl border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{t(`buckets.${key}`)}</p>
                <Badge variant={variant}>{items.length}</Badge>
              </div>
              <ul className="space-y-1">
                {items.slice(0, 6).map((item) => (
                  <li key={item.id} className="text-xs">
                    {item.assetId ? (
                      <Link href={`/admin/assets/${item.assetId}`} className="hover:underline">
                        {item.assetId.slice(0, 8)}
                      </Link>
                    ) : (
                      item.id.slice(0, 8)
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <WarrantySetup products={products} purchaseOrders={purchaseOrders} />
    </div>
  )
}
