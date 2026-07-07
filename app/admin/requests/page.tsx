import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Plus, Search } from "lucide-react"
import { getRequests } from "@/lib/actions/requests"
import { buttonVariants } from "@/components/ui/button"
import { Badge, requestStatusVariant } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS = [
  "draft",
  "assigned",
  "in_progress",
  "completed",
  "failed",
  "on_hold",
  "cancelled",
  "rescheduled",
] as const

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>
}) {
  const { status, search, page } = await searchParams
  const pageNum = Math.max(1, Number(page) || 1)
  const [t, tCommon, result] = await Promise.all([
    getTranslations("requests"),
    getTranslations("common"),
    getRequests({ status, search, page: pageNum }),
  ])
  const requestList = result.rows

  const buildPageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (status) sp.set("status", status)
    if (search) sp.set("search", search)
    if (p > 1) sp.set("page", String(p))
    const qs = sp.toString()
    return qs ? `/admin/requests?${qs}` : "/admin/requests"
  }
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
  const to = Math.min(result.page * result.pageSize, result.total)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/admin/requests/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          {t("new")}
        </Link>
      </div>

      {/* Filter */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={search ?? ""}
            placeholder={t("searchPlaceholder")}
            className="ps-8 w-full"
          />
        </div>
        <Select name="status" defaultValue={status ?? ""} className="w-full sm:w-48">
          <option value="">{tCommon("all")}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "outline", size: "default" }))}
        >
          {tCommon("filter")}
        </button>
        {(status || search) && (
          <Link href="/admin/requests" className={cn(buttonVariants({ variant: "ghost", size: "default" }))}>
            {tCommon("clear")}
          </Link>
        )}
      </form>

      {/* List */}
      {requestList.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-2 sm:hidden">
            {requestList.map((r) => (
              <Link
                key={r.id}
                href={`/admin/requests/${r.id}`}
                className="block rounded-lg border p-4 active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{r.requestNumber}</span>
                  <Badge variant={requestStatusVariant[r.status] ?? "outline"}>
                    {t(`status.${r.status}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.customerName ?? "—"}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {r.typeName && <span>{r.typeName}</span>}
                  {r.deliveryDate && <span>{formatDate(r.deliveryDate)}</span>}
                  {r.quoteNumber && <span className="font-mono">{r.quoteNumber}</span>}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden rounded-lg border overflow-hidden sm:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                    {t("requestNumber")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden lg:table-cell">
                    {t("quoteNumber")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">
                    {t("type")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                    {t("customer")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                    {tCommon("status")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">
                    {t("deliveryDate")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requestList.map((r) => (
                  <tr key={r.id} className="relative hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/requests/${r.id}`}
                        className="font-mono font-medium after:absolute after:inset-0"
                      >
                        {r.requestNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden lg:table-cell">
                      {r.quoteNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {r.typeName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.customerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={requestStatusVariant[r.status] ?? "outline"}>
                        {t(`status.${r.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {formatDate(r.deliveryDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pagination */}
      {result.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {tCommon("showing", { from, to, total: result.total })}
          </p>
          {result.totalPages > 1 && (
            <div className="flex items-center gap-2">
              {result.page > 1 ? (
                <Link
                  href={buildPageHref(result.page - 1)}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  {tCommon("previous")}
                </Link>
              ) : (
                <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
                  {tCommon("previous")}
                </span>
              )}
              <span className="text-muted-foreground tabular-nums">
                {tCommon("page")} {result.page} {tCommon("of")} {result.totalPages}
              </span>
              {result.page < result.totalPages ? (
                <Link
                  href={buildPageHref(result.page + 1)}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  {tCommon("next")}
                </Link>
              ) : (
                <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
                  {tCommon("next")}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
