import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getSourcingRequests } from "@/lib/actions/sourcing"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { sourcingStatusVariant as STATUS_VARIANT } from "@/lib/domain/status-variant"

export default async function SourcingPage() {
  const [t, requests] = await Promise.all([getTranslations("sourcing"), getSourcingRequests()])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/sourcing/unsourced"
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          >
            {t("unsourced.title")}
          </Link>
          <Link href="/admin/sourcing/new" className={cn(buttonVariants(), "gap-1.5")}>
            {t("newRequest")}
          </Link>
        </div>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3">{t("externalRef")}</th>
                <th className="p-3">{t("requestTitle")}</th>
                <th className="p-3">{t("sourceType")}</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-3" dir="ltr">{r.externalRef ?? "—"}</td>
                  <td className="p-3">
                    <Link href={`/admin/sourcing/${r.id}`} className="font-medium hover:underline">
                      {r.title ?? r.description}
                    </Link>
                  </td>
                  <td className="p-3">{t(`sourceTypes.${r.sourceType}` as never)}</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>
                      {t(`statuses.${r.status}` as never)}
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
