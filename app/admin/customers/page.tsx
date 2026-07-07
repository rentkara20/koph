import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Plus, Search } from "lucide-react"
import { getCustomers } from "@/lib/actions/customers"
import { buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const [t, tCommon, customerList] = await Promise.all([
    getTranslations("customers"),
    getTranslations("common"),
    getCustomers(q),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/admin/customers/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          {t("new")}
        </Link>
      </div>

      {/* Search */}
      <form method="GET" className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder={tCommon("search")}
          className="flex h-9 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        />
      </form>

      {/* List */}
      {customerList.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-2 sm:hidden">
            {customerList.map((c) => (
              <Link
                key={c.id}
                href={`/admin/customers/${c.id}`}
                className="block rounded-lg border p-4 active:bg-muted/40"
              >
                <p className="font-medium">{c.name}</p>
                {c.contactPerson && <p className="text-sm text-muted-foreground">{c.contactPerson}</p>}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {c.mobile && <span>{c.mobile}</span>}
                  {c.city && <span>{c.city}</span>}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden rounded-lg border overflow-hidden sm:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("name")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t("contactPerson")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("mobile")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">{t("city")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden lg:table-cell">{tCommon("date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customerList.map((c) => (
                  <tr key={c.id} className="relative hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {c.contactPerson ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.mobile ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.city ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {formatDate(c.createdAt)}
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
