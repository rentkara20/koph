import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"
import { ShieldCheck } from "lucide-react"
import { getBatchByStatementToken } from "@/lib/actions/payments"
import { Badge } from "@/components/ui/badge"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { formatDate } from "@/lib/utils/format"

const BATCH_STATUS_VARIANT: Record<string, "outline" | "info" | "warning" | "success"> = {
  draft: "outline",
  approved: "info",
  sent_to_finance: "warning",
  paid: "success",
}

function makeMoney(locale: string) {
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
  })
  return (n: number) => fmt.format(n)
}

export default async function StatementPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const locale = await getLocale()
  const money = makeMoney(locale)
  const [data, t, tPay, tModels, tStatus] = await Promise.all([
    getBatchByStatementToken(token),
    getTranslations("statement"),
    getTranslations("payments"),
    getTranslations("partners.pricingModels"),
    getTranslations("payments.status"),
  ])

  if (!data) {
    return (
      <main className="min-h-dvh grid place-items-center bg-muted/30 p-6">
        <div className="text-center space-y-4">
          <Image src="/kara-logo.png" alt="KARA" width={120} height={53} className="mx-auto h-11 w-auto dark:hidden" />
          <Image src="/kara-logo-light.png" alt="KARA" width={120} height={53} className="mx-auto hidden h-11 w-auto dark:block" />
          <p className="text-sm text-muted-foreground">{t("notFound")}</p>
        </div>
      </main>
    )
  }

  const { batch, payments } = data

  return (
    <main className="min-h-dvh bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <Image src="/kara-logo.png" alt="KARA" width={110} height={48} className="h-10 w-auto dark:hidden" priority />
          <Image src="/kara-logo-light.png" alt="KARA" width={110} height={48} className="hidden h-10 w-auto dark:block" priority />
          <LocaleToggle />
        </header>

        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
          {/* Title + meta */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">{t("title")}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t("for")} <span className="font-medium text-foreground">{batch.partnerName ?? "—"}</span>
                </p>
              </div>
              <Badge variant={BATCH_STATUS_VARIANT[batch.status] ?? "outline"}>
                {tStatus(batch.status)}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs">{t("period")}</dt>
                <dd className="font-medium font-mono mt-0.5">{batch.period}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t("generatedOn")}</dt>
                <dd className="font-medium mt-0.5">{formatDate(batch.generatedAt)}</dd>
              </div>
              {batch.paidAt && (
                <div>
                  <dt className="text-muted-foreground text-xs">{t("paidOn")}</dt>
                  <dd className="font-medium mt-0.5">{formatDate(batch.paidAt)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Line items */}
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("requestNumber")}</th>
                    <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("pricing")}</th>
                    <th className="px-3 py-2 text-end font-medium text-muted-foreground">{t("quantity")}</th>
                    <th className="px-3 py-2 text-end font-medium text-muted-foreground">{t("unitPrice")}</th>
                    <th className="px-3 py-2 text-end font-medium text-muted-foreground">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id} className={p.status === "on_hold" ? "opacity-60" : ""}>
                      <td className="px-3 py-2.5 font-mono">{p.requestNumber ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {tModels(p.pricingModel)}
                        {p.status === "on_hold" && (
                          <span className="ms-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            {tPay("held")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{p.quantity}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{money(p.unitPrice)}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums font-medium">{money(p.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 bg-muted/30">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-end font-medium">{t("total")}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums font-bold text-primary">
                      {money(batch.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Trust note */}
          <div className="flex items-start gap-2.5 rounded-lg bg-kara-blue-soft p-3 text-xs text-foreground/80">
            <ShieldCheck className="size-4 shrink-0 text-kara-purple mt-0.5" />
            <p>{t("note")}</p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          KARA — شركة كارا لتقنية المعلومات · rentkara.com
        </p>
      </div>
    </main>
  )
}
