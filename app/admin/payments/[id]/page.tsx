import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getBatchWithPayments } from "@/lib/actions/payments"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/utils/format"
import { BatchActions } from "./_components/batch-actions"
import { CopyStatementLink } from "./_components/copy-statement-link"
import { PaymentLineActions } from "./_components/payment-line-actions"
import { cn } from "@/lib/utils"
import { paymentBatchStatusVariant as STATUS_VARIANT } from "@/lib/domain/status-variant"

export default async function PaymentBatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await getTranslations("payments")
  const STATUS_LABEL: Record<string, string> = {
    draft: t("statusDraft"),
    approved: t("statusApproved"),
    sent_to_finance: t("statusSentToFinance"),
    paid: t("statusPaid"),
  }
  const data = await getBatchWithPayments(id)

  if (!data) notFound()

  const { batch, payments } = data

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/payments"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">
                {batch.partnerName ?? "—"} — {batch.period}
              </h1>
              <Badge variant={STATUS_VARIANT[batch.status] ?? "outline"}>
                {STATUS_LABEL[batch.status] ?? batch.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("generated", { date: formatDate(batch.generatedAt) })}
            </p>
          </div>
        </div>
        {batch.statementToken && <CopyStatementLink token={batch.statementToken} />}
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("partner")}</p>
              <p className="font-medium mt-0.5">{batch.partnerName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("period")}</p>
              <p className="font-mono font-medium mt-0.5">{batch.period}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("totalAmountSar")}</p>
              <p className="font-semibold tabular-nums mt-0.5">{batch.totalAmount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("paymentsCount")}</p>
              <p className="font-medium mt-0.5">{payments.length}</p>
            </div>
          </div>

          {(batch.approvedAt || batch.sentAt || batch.paidAt) && (
            <>
              <Separator className="my-3" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                {batch.approvedAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("approvedAt")}</p>
                    <p className="font-medium mt-0.5">{formatDate(batch.approvedAt)}</p>
                  </div>
                )}
                {batch.sentAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("sentAt")}</p>
                    <p className="font-medium mt-0.5">{formatDate(batch.sentAt)}</p>
                  </div>
                )}
                {batch.paidAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("paidAt")}</p>
                    <p className="font-medium mt-0.5">{formatDate(batch.paidAt)}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {batch.status !== "paid" && (
        <BatchActions
          batchId={batch.id}
          status={batch.status}
          partnerName={batch.partnerName ?? ""}
          period={batch.period}
          payments={payments.map((p) => ({
            requestNumber: p.requestNumber,
            pricingModel: p.pricingModel,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            totalAmount: p.totalAmount,
          }))}
        />
      )}

      {/* Payments table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("paymentsCount")} ({payments.length})
            </CardTitle>
            {batch.status === "paid" && (
              <BatchActions
                batchId={batch.id}
                status={batch.status}
                partnerName={batch.partnerName ?? ""}
                period={batch.period}
                payments={payments.map((p) => ({
                  requestNumber: p.requestNumber,
                  pricingModel: p.pricingModel,
                  quantity: p.quantity,
                  unitPrice: p.unitPrice,
                  totalAmount: p.totalAmount,
                }))}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              {t("noPayments")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("request")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t("pricing")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t("qty")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t("unitSar")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("totalSar")}</th>
                  <th className="px-4 py-2.5 text-end font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      {p.requestId ? (
                        <Link
                          href={`/admin/requests/${p.requestId}`}
                          className="font-mono hover:text-primary transition-colors"
                        >
                          {p.requestNumber ?? p.requestId}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell capitalize">
                      {p.pricingModel.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {p.quantity}
                    </td>
                    <td className="px-4 py-3 tabular-nums hidden sm:table-cell">
                      {p.unitPrice.toFixed(2)}
                    </td>
                    <td className={cn("px-4 py-3 font-medium tabular-nums", p.status === "on_hold" && "opacity-60")}>
                      {p.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <PaymentLineActions
                        paymentId={p.id}
                        status={p.status}
                        batchStatus={batch.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/50">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-right text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    {t("total")}
                  </td>
                  <td className="px-4 py-2.5 font-semibold tabular-nums">
                    {payments.reduce((s, p) => s + p.totalAmount, 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
