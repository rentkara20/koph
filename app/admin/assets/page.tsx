import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { FileSpreadsheet, Search } from "lucide-react"
import { getAssets, getAssetStatusCounts } from "@/lib/actions/assets"
import type { AssetStatus } from "@/lib/domain/asset-status"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GenerateTagsButton } from "./_components/generate-tags-button"
import { SyncNotionButton } from "./_components/sync-notion-button"
import { ASSET_STATUS_VARIANT } from "./status-variant"

const STATUS_ORDER: AssetStatus[] = [
  "in_stock",
  "reserved",
  "assigned",
  "delivered",
  "returned",
  "maintenance",
  "damaged",
  "retired",
  "sold",
  "lost",
]


export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const { q, status, page } = await searchParams
  const statusFilter = STATUS_ORDER.includes(status as AssetStatus)
    ? (status as AssetStatus)
    : undefined

  const [t, tCommon, tImportExport, { assets, total, page: currentPage, pageSize }, counts] =
    await Promise.all([
      getTranslations("assets"),
      getTranslations("common"),
      getTranslations("importExport"),
      getAssets({ search: q, status: statusFilter, page: page ? parseInt(page, 10) : 1 }),
      getAssetStatusCounts(),
    ])

  const countMap = new Map(counts.map((c) => [c.status, c.total]))
  const grandTotal = counts.reduce((s, c) => s + c.total, 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const filterHref = (s?: AssetStatus) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (s) params.set("status", s)
    const qs = params.toString()
    return `/admin/assets${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/settings/import-export?module=asset"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <FileSpreadsheet className="size-3.5" />
            {tImportExport("linkLabel")}
          </Link>
          <SyncNotionButton />
          <GenerateTagsButton />
          <Link
            href="/admin/assets/new"
            className="inline-flex h-9 items-center rounded-md bg-kara-purple px-3 text-sm font-medium text-white hover:opacity-90"
          >
            {t("createAsset")}
          </Link>
        </div>
      </div>

      {/* Status filter chips with live counts */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={filterHref()}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            !statusFilter
              ? "border-transparent bg-kara-purple text-white"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          {t("all")} · {grandTotal}
        </Link>
        {STATUS_ORDER.filter((s) => (countMap.get(s) ?? 0) > 0).map((s) => (
          <Link
            key={s}
            href={filterHref(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === s
                ? "border-transparent bg-kara-purple text-white"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {t(`statuses.${s}`)} · {countMap.get(s)}
          </Link>
        ))}
      </div>

      {/* Search */}
      <form method="GET" className="relative w-full sm:max-w-sm">
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <label htmlFor="asset-search" className="sr-only">
          {tCommon("search")}
        </label>
        <input
          id="asset-search"
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          className="flex h-9 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        />
      </form>

      {/* Table */}
      {assets.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("assetTag")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("device")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">{t("serial")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("status")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden lg:table-cell">{t("customer")}</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden lg:table-cell">{t("order")}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/assets/${a.id}`}
                      className="font-mono text-xs font-semibold text-kara-purple hover:underline"
                      dir="ltr"
                    >
                      {a.assetTag ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/assets/${a.id}`} className="hover:underline">
                      <span className="font-medium">{a.description}</span>
                      {(a.brand || a.model) && (
                        <span className="block text-xs text-muted-foreground">
                          {[a.brand, a.model].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell font-mono text-xs text-muted-foreground" dir="ltr">
                    {a.serialNumber ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={ASSET_STATUS_VARIANT[a.status] ?? "outline"}>
                      {t(`statuses.${a.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell text-muted-foreground">
                    {a.currentCustomerName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell font-mono text-xs text-muted-foreground" dir="ltr">
                    {a.orderNumber}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center gap-2 text-sm" aria-label={tCommon("pagination")}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams()
            if (q) params.set("q", q)
            if (statusFilter) params.set("status", statusFilter)
            if (p > 1) params.set("page", String(p))
            const qs = params.toString()
            return (
              <Link
                key={p}
                href={`/admin/assets${qs ? `?${qs}` : ""}`}
                aria-current={p === currentPage ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1",
                  p === currentPage
                    ? "bg-kara-purple font-medium text-white"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {p}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
