import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getSourcingRequests } from "@/lib/actions/sourcing"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  rfq_sent: "default",
  quotes_received: "default",
  under_evaluation: "warning",
  approved: "success",
  handed_off: "success",
  rejected: "destructive",
  cancelled: "destructive",
  closed: "secondary",
}

export default async function SourcingPage() {
  const [t, requests] = await Promise.all([getTranslations("sourcing"), getSourcingRequests()])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/admin/sourcing/new" className={cn(buttonVariants(), "gap-1.5")}>
          {t("newRequest")}
        </Link>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3">{t("description")}</th>
                <th className="p-3">{t("sourceType")}</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-3">
                    <Link href={`/admin/sourcing/${r.id}`} className="font-medium hover:underline">
                      {r.description}
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
