import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Plus } from "lucide-react"
import { getPartners } from "@/lib/actions/partners"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export default async function PartnersPage() {
  const [t, tCommon, partnerList] = await Promise.all([
    getTranslations("partners"),
    getTranslations("common"),
    getPartners(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/admin/partners/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          {t("new")}
        </Link>
      </div>

      {partnerList.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("name")}</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Contact</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Mobile</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">City</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{tCommon("status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {partnerList.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/partners/${p.id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {p.contactPerson ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.mobile ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{p.city ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={p.status === "active" ? "success" : "secondary"}>
                      {p.status === "active" ? "Active" : "Inactive"}
                    </Badge>
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
