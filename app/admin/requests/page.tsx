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
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  const { status, search } = await searchParams
  const [t, tCommon, requestList] = await Promise.all([
    getTranslations("requests"),
    getTranslations("common"),
    getRequests({ status, search }),
  ])

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
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={search ?? ""}
            placeholder="Search by request #, customer, quote…"
            className="pl-8 w-64"
          />
        </div>
        <Select name="status" defaultValue={status ?? ""} className="w-48">
          <option value="">{tCommon("filter")}: All</option>
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
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      {requestList.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  {t("requestNumber")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">
                  {t("quoteNumber")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  {t("type")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  {t("customer")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  {tCommon("status")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">
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
      )}
    </div>
  )
}
