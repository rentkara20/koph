import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getWarrantyRegistry, getWarrantyProducts, type WarrantyRegistryStatus } from "@/lib/actions/warranty"
import { getSuppliers } from "@/lib/actions/suppliers"
import { getPurchaseOrders } from "@/lib/actions/procurement"
import { getWarrantyRequestMessageTemplates } from "@/lib/actions/settings"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { warrantyRegistryStatusVariant as STATUS_VARIANT } from "@/lib/domain/status-variant"
import { RegistryTable } from "./_components/registry-table"

const STAT_ORDER: WarrantyRegistryStatus[] = ["none", "expiring_soon", "expired", "active", "pending"]

export default async function WarrantyRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const [t, format, rows, products, suppliers, purchaseOrders, messageTemplates] = await Promise.all([
    getTranslations("warranty.registry"),
    getFormatter(),
    getWarrantyRegistry(),
    getWarrantyProducts(),
    getSuppliers(),
    getPurchaseOrders(),
    getWarrantyRequestMessageTemplates(),
  ])

  const statusFilter = STAT_ORDER.includes(status as WarrantyRegistryStatus)
    ? (status as WarrantyRegistryStatus)
    : undefined
  const filteredRows = statusFilter ? rows.filter((r) => r.warrantyStatus === statusFilter) : rows

  const counts = STAT_ORDER.reduce(
    (acc, key) => ({ ...acc, [key]: rows.filter((r) => r.warrantyStatus === key).length }),
    {} as Record<WarrantyRegistryStatus, number>
  )

  const filterHref = (s?: WarrantyRegistryStatus) => (s ? `/admin/warranty/registry?status=${s}` : "/admin/warranty/registry")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/warranty" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {t("backToCenter")}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["none", "expiring_soon", "expired", "active"] as const).map((key) => (
          <Link
            key={key}
            href={filterHref(statusFilter === key ? undefined : key)}
            className={cn(
              "rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40",
              statusFilter === key && "border-primary ring-1 ring-primary/30"
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {t(`stat${key === "none" ? "None" : key === "expiring_soon" ? "ExpiringSoon" : key === "expired" ? "Expired" : "Active"}` as never)}
              </p>
              <Badge variant={STATUS_VARIANT[key]}>{counts[key]}</Badge>
            </div>
          </Link>
        ))}
      </div>

      {statusFilter && (
        <Link href={filterHref()} className="text-xs text-muted-foreground hover:underline">
          {t("filterAll")} ({rows.length})
        </Link>
      )}

      <RegistryTable
        rows={filteredRows.map((row) => ({
          ...row,
          purchaseDateLabel: row.purchaseDate ? format.dateTime(new Date(row.purchaseDate), { dateStyle: "medium" }) : "—",
          endAtLabel: row.endAt ? format.dateTime(new Date(row.endAt), { dateStyle: "medium" }) : "—",
        }))}
        products={products.map((p) => ({ id: p.id, nameEn: p.nameEn }))}
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          contactPerson: s.contactPerson,
          mobile: s.mobile,
          email: s.email,
        }))}
        purchaseOrders={purchaseOrders}
        messageTemplates={messageTemplates}
      />
    </div>
  )
}
