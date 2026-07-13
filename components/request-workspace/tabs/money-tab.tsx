import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"

// Money: partner payments born from this request's jobs + their batch status.
export async function MoneyTab({ workspace }: { workspace: RequestWorkspace }) {
  const [t, tPayments, locale] = await Promise.all([
    getTranslations("workspace"),
    getTranslations("payments"),
    getLocale(),
  ])
  const money = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
  })
  const total = workspace.payments.reduce((acc, p) => acc + p.totalAmount, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("money.partnerPayments")}</CardTitle>
        {workspace.payments.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("money.total", { amount: money.format(total) })}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {workspace.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("money.none")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {workspace.payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.partnerName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" dir="ltr">
                    {money.format(p.totalAmount)}
                  </span>
                  <Badge variant="outline">{tPayments(`lineStatus.${p.status}`)}</Badge>
                  {p.batchId && p.batchStatus && (
                    <Link
                      href={`/admin/payments/${p.batchId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("money.batch")}: {tPayments(`status.${p.batchStatus}`)}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
