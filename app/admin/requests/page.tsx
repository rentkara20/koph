import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { FileSpreadsheet, Plus, Search } from "lucide-react"
import { getRequests, type RequestListItem } from "@/lib/actions/requests"
import { isRequestView, REQUEST_VIEWS } from "@/lib/domain/request-list"
import { buttonVariants } from "@/components/ui/button"
import { Badge, requestStatusVariant } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { formatDateLocalized, riyadhDayDiff } from "@/lib/utils/format"
import { deriveNextStep, type NextStepTone } from "@/lib/domain/request-next-step"
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

// Statuses where a past delivery date is history, not a problem — colouring
// those rows red would make every completed request scream for attention.
const CLOSED_STATUSES = new Set(["completed", "cancelled", "failed"])

// The next step matters most when it is something a human must do now; a
// "waiting on the partner" row should not compete for the same attention.
const NEXT_STEP_TONE_CLASS: Record<NextStepTone, string> = {
  action: "text-foreground font-medium",
  waiting: "text-muted-foreground",
  done: "text-muted-foreground",
  paused: "text-amber-700 dark:text-amber-500",
  cancelled: "text-muted-foreground",
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; view?: string; page?: string }>
}) {
  const { status, search, view, page } = await searchParams
  const activeView = isRequestView(view) ? view : undefined
  const pageNum = Math.max(1, Number(page) || 1)
  const [t, tCommon, tImportExport, tNextStep, locale, result] = await Promise.all([
    getTranslations("requests"),
    getTranslations("common"),
    getTranslations("importExport"),
    getTranslations("nextStep"),
    getLocale(),
    getRequests({ status, search, view: activeView, page: pageNum }),
  ])
  const requestList = result.rows
  const typeLabel = (r: { typeName: string | null; typeNameAr: string | null }) =>
    locale === "ar" ? (r.typeNameAr ?? r.typeName) : (r.typeName ?? r.typeNameAr)

  const buildHref = (overrides: { view?: string | null; page?: number }) => {
    const sp = new URLSearchParams()
    if (status) sp.set("status", status)
    if (search) sp.set("search", search)
    const nextView = overrides.view === undefined ? activeView : overrides.view
    if (nextView) sp.set("view", nextView)
    const nextPage = overrides.page ?? 1
    if (nextPage > 1) sp.set("page", String(nextPage))
    const qs = sp.toString()
    return qs ? `/admin/requests?${qs}` : "/admin/requests"
  }
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
  const to = Math.min(result.page * result.pageSize, result.total)

  // Collection requests date from collectionDate, deliveries from deliveryDate;
  // showing only the latter left every collection row as a bare em dash.
  const effectiveDate = (r: RequestListItem) => r.deliveryDate ?? r.collectionDate

  // Renders the operative date with its urgency, so "late" is visible without
  // the reader mentally diffing every row against today.
  const DateCell = ({ r, className }: { r: RequestListItem; className?: string }) => {
    const ts = effectiveDate(r)
    const diff = riyadhDayDiff(ts)
    const isOpen = !CLOSED_STATUSES.has(r.status)
    const overdue = isOpen && diff !== null && diff < 0
    const dueToday = isOpen && diff === 0

    let note: string | null = null
    if (overdue) note = t("due.overdue", { days: Math.abs(diff!) })
    else if (dueToday) note = t("due.today")
    else if (isOpen && diff === 1) note = t("due.tomorrow")

    return (
      <span
        className={cn(
          "inline-flex flex-wrap items-baseline gap-x-1.5",
          overdue && "text-red-600 dark:text-red-400 font-medium",
          dueToday && "text-amber-700 dark:text-amber-500 font-medium",
          !overdue && !dueToday && "text-muted-foreground",
          className
        )}
      >
        {formatDateLocalized(ts, locale)}
        {note && <span className="text-[11px]">{note}</span>}
      </span>
    )
  }

  // "Unassigned" is the single most expensive state on this screen — a job
  // nobody is doing — so it reads as an alert rather than an empty cell.
  const PartnerCell = ({ r }: { r: RequestListItem }) => {
    if (r.partnerNames.length === 0) {
      if (CLOSED_STATUSES.has(r.status)) return <span className="text-muted-foreground">—</span>
      return (
        <Badge variant="destructive">{t("unassigned")}</Badge>
      )
    }
    const [first, ...rest] = r.partnerNames
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-foreground">{first}</span>
        {rest.length > 0 && (
          <span
            className="text-xs text-muted-foreground"
            title={r.partnerNames.join("، ")}
          >
            +{rest.length}
          </span>
        )}
      </span>
    )
  }

  const nextStepText = (r: RequestListItem) => {
    const { key, tone } = deriveNextStep(r)
    return { text: tNextStep(key), tone }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/settings/import-export?module=request"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
          >
            <FileSpreadsheet className="size-3.5" />
            {tImportExport("exportDataLabel")}
          </Link>
          <Link href="/admin/requests/new" className={cn(buttonVariants(), "gap-1.5")}>
            <Plus className="size-4" />
            {t("new")}
          </Link>
        </div>
      </div>

      {/* Quick views — one click for the questions Ops actually asks, which the
          status dropdown cannot express (unassigned, overdue, due today). */}
      <nav className="flex flex-wrap gap-1.5" aria-label={t("views.label")}>
        <Link
          href={buildHref({ view: null })}
          aria-current={!activeView ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: !activeView ? "default" : "outline", size: "sm" }),
            "rounded-full"
          )}
        >
          {tCommon("all")}
        </Link>
        {REQUEST_VIEWS.map((v) => (
          <Link
            key={v}
            href={buildHref({ view: activeView === v ? null : v })}
            aria-current={activeView === v ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: activeView === v ? "default" : "outline", size: "sm" }),
              "rounded-full"
            )}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </nav>

      {/* Filter */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        {activeView && <input type="hidden" name="view" value={activeView} />}
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
        {(status || search || activeView) && (
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
            {requestList.map((r) => {
              const nextStep = nextStepText(r)
              return (
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
                  <p className={cn("mt-1 text-xs", NEXT_STEP_TONE_CLASS[nextStep.tone])}>
                    {nextStep.text}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {typeLabel(r) && <span>{typeLabel(r)}</span>}
                    {r.itemCount > 0 && <span>{t("deviceCount", { count: r.itemQuantity })}</span>}
                    <DateCell r={r} className="text-xs" />
                    {r.quoteNumber && <span className="font-mono">{r.quoteNumber}</span>}
                  </div>
                  <div className="mt-2 text-xs">
                    <PartnerCell r={r} />
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden rounded-lg border overflow-hidden sm:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                    {t("requestNumber")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden xl:table-cell">
                    {t("quoteNumber")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden lg:table-cell">
                    {t("type")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                    {t("customer")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">
                    {t("partner")}
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
                {requestList.map((r) => {
                  const nextStep = nextStepText(r)
                  return (
                    <tr key={r.id} className="relative hover:bg-muted/30 transition-colors cursor-pointer">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/requests/${r.id}`}
                          className="font-mono font-medium after:absolute after:inset-0"
                        >
                          {r.requestNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden xl:table-cell">
                        {r.quoteNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {typeLabel(r) ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground">{r.customerName ?? "—"}</span>
                        {r.itemCount > 0 && (
                          <span className="block text-xs text-muted-foreground/70">
                            {t("deviceCount", { count: r.itemQuantity })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <PartnerCell r={r} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={requestStatusVariant[r.status] ?? "outline"}>
                          {t(`status.${r.status}`)}
                        </Badge>
                        <span
                          className={cn(
                            "mt-1 block max-w-[22ch] text-xs leading-snug",
                            NEXT_STEP_TONE_CLASS[nextStep.tone]
                          )}
                        >
                          {nextStep.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <DateCell r={r} />
                      </td>
                    </tr>
                  )
                })}
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
                  href={buildHref({ page: result.page - 1 })}
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
                  href={buildHref({ page: result.page + 1 })}
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
