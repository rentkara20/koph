import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { FileSpreadsheet, Plus, Search } from "lucide-react"
import { getSuppliers } from "@/lib/actions/suppliers"
import { buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const [t, tCommon, tImportExport, supplierList] = await Promise.all([
    getTranslations("suppliers"),
    getTranslations("common"),
    getTranslations("importExport"),
    getSuppliers(q),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/settings/import-export?module=supplier"
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          >
            <FileSpreadsheet className="size-4" />
            {tImportExport("linkLabel")}
          </Link>
          <Link href="/admin/suppliers/new" className={cn(buttonVariants(), "gap-1.5")}>
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
          placeholder={tCommon("search")}
          className="flex h-9 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        />
      </form>

      {/* List */}
      {supplierList.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-2 sm:hidden">
            {supplierList.map((s) => (
              <Link
                key={s.id}
                href={`/admin/suppliers/${s.id}`}
                className="block rounded-lg border p-4 active:bg-muted/40"
              >
                <p className="font-medium">{s.name}</p>
                {s.contactPerson && <p className="text-sm text-muted-foreground">{s.contactPerson}</p>}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {s.mobile && <span>{s.mobile}</span>}
                  {s.city && <span>{s.city}</span>}
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
                {supplierList.map((s) => (
                  <tr key={s.id} className="relative hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/suppliers/${s.id}`}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {s.contactPerson ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.mobile ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{s.city ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {formatDate(s.createdAt)}
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
