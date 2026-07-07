import Link from "next/link"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ExternalLink } from "lucide-react"
import { getMyEarnings, getMyStatements } from "@/lib/actions/partner-portal"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils/format"

const BATCH_STATUS_VARIANT: Record<string, "outline" | "info" | "warning" | "success"> = {
  draft: "outline",
  approved: "info",
  sent_to_finance: "warning",
  paid: "success",
}

export default async function PartnerStatementsPage() {
  const [t, tPay, locale, statements, earnings] = await Promise.all([
    getTranslations("partnerPortal"),
    getTranslations("payments"),
    getLocale(),
    getMyStatements(),
    getMyEarnings(),
  ])

  if (!statements || !earnings) redirect("/login")

  const money = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
  })

  return (
    <div className="space-y-5 p-4">
      <h1 className="text-xl font-semibold">{t("statements")}</h1>

      {/* Statements (monthly batches) */}
      {statements.batches.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {t("noStatements")}
        </div>
      ) : (
        <ul className="space-y-2">
          {statements.batches.map((b) => (
            <li key={b.id}>
              <Link
                href={`/statement/${b.statementToken}`}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="font-mono text-sm font-semibold" dir="ltr">
                    {b.period}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.paidAt ? formatDate(b.paidAt) : formatDate(b.generatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-bold tabular-nums">{money.format(b.totalAmount)}</span>
                  <Badge variant={BATCH_STATUS_VARIANT[b.status] ?? "outline"}>
                    {tPay(`batchStatus.${b.status}` as never)}
                  </Badge>
                  <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Per-task earnings history */}
      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">{t("earningsHistory")}</h2>
        {earnings.recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noStatements")}</p>
        ) : (
          <ul className="divide-y">
            {earnings.recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {p.requestNumber ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground/70">{formatDate(p.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {money.format(p.totalAmount)}
                  </span>
                  <Badge
                    variant={
                      p.status === "paid" ? "success" : p.status === "on_hold" ? "warning" : "info"
                    }
                  >
                    {tPay(`lineStatus.${p.status}` as never)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
