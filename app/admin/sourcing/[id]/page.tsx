import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getSourcingRequest } from "@/lib/actions/sourcing"
import { getQuotationsForSourcingRequest } from "@/lib/actions/quotations"
import { getLatestCommercialEvaluation } from "@/lib/actions/commercial-approval"
import { getProcurementCase, getProcurementCaseForSourcingRequest } from "@/lib/actions/procurement-case"
import { getSuppliers } from "@/lib/actions/suppliers"
import { Badge } from "@/components/ui/badge"
import { ProcurementCasePanel } from "@/components/procurement-case-panel"
import { buildRfqEmailSubject, buildRfqMessage } from "@/lib/domain/rfq-message"
import { buildWhatsappUrl } from "@/lib/utils/whatsapp"
import { SendRfqForm } from "./_components/send-rfq-form"
import { RfqMessageActions } from "./_components/rfq-message-actions"
import { QuotationForm } from "./_components/quotation-form"
import { EvaluationApprovalPanel } from "./_components/evaluation-approval-panel"

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

const ITEM_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  pending: "secondary",
  rfq_sent: "default",
  quoted: "warning",
  selected: "success",
  not_sourced: "destructive",
  cancelled: "destructive",
}

export default async function SourcingRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [t, format, data] = await Promise.all([
    getTranslations("sourcing"),
    getFormatter(),
    getSourcingRequest(id),
  ])
  if (!data) notFound()
  const { request, items, rfqs, rfqItemIds } = data

  const [quotations, evaluation, procurementCase, suppliers] = await Promise.all([
    getQuotationsForSourcingRequest(id),
    getLatestCommercialEvaluation(id),
    getProcurementCaseForSourcingRequest(id),
    getSuppliers(),
  ])

  const quotationOptions = quotations.map((q) => ({ id: q.quotation.id, supplierName: q.supplierName }))
  const procurementCaseDetail = procurementCase ? await getProcurementCase(procurementCase.id) : null
  const itemById = new Map(items.map((item) => [item.id, item]))
  const sourceableItems = items.filter((item) => !["cancelled", "not_sourced"].includes(item.status))

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{request.title ?? request.description}</h1>
          <p className="text-sm text-muted-foreground">
            {request.externalRef && <span dir="ltr">{request.externalRef} · </span>}
            {t(`sourceTypes.${request.sourceType}` as never)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[request.status] ?? "secondary"}>
          {t(`statuses.${request.status}` as never)}
        </Badge>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("items")}</p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3">{t("qty")}</th>
                  <th className="p-3">{t("customerDescription")}</th>
                  <th className="p-3">{t("supplierDescription")}</th>
                  <th className="p-3">{t("partNumber")}</th>
                  <th className="p-3">{t("itemStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 align-top">
                    <td className="p-3">{item.quantity}</td>
                    <td className="p-3">{item.customerDescription}</td>
                    <td className="p-3">{item.supplierDescription}</td>
                    <td className="p-3" dir="ltr">{item.partNumber ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant={ITEM_STATUS_VARIANT[item.status] ?? "secondary"}>
                        {t(`itemStatuses.${item.status}` as never)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!["cancelled", "closed", "handed_off"].includes(request.status) &&
        sourceableItems.length > 0 &&
        suppliers.length > 0 && (
          <SendRfqForm sourcingRequestId={id} items={sourceableItems} suppliers={suppliers} />
        )}

      {rfqs.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("rfqHistory")}</p>
          {rfqs.map((rfq) => {
            const rfqItems = (rfqItemIds[rfq.id] ?? [])
              .map((itemId) => itemById.get(itemId))
              .filter((item) => item != null)
            const message = buildRfqMessage({
              supplierContactName: rfq.supplierContactPerson,
              externalRef: request.externalRef,
              title: request.title,
              items: rfqItems,
            })
            return (
              <div key={rfq.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm">{rfq.supplierName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(rfq.sentAt), { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <Badge variant={rfq.status === "responded" ? "success" : "secondary"}>
                    {t(`rfqStatuses.${rfq.status}` as never)}
                  </Badge>
                </div>
                {rfqItems.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {rfqItems.map((item) => (
                      <li key={item.id}>
                        {item.quantity}× {item.supplierDescription}
                        {item.partNumber && <span dir="ltr"> · {item.partNumber}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {rfq.status === "sent" && rfqItems.length > 0 && (
                  <RfqMessageActions
                    message={message}
                    emailSubject={buildRfqEmailSubject(request.externalRef, request.title)}
                    whatsappUrl={buildWhatsappUrl(rfq.supplierMobile, message)}
                    email={rfq.supplierEmail}
                  />
                )}
                {rfq.status === "sent" && <QuotationForm rfqId={rfq.id} />}
              </div>
            )
          })}
        </div>
      )}

      {quotations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("quoteComparison")}</p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3">{t("supplier")}</th>
                  <th className="p-3">{t("itemDescription")}</th>
                  <th className="p-3">{t("qty")}</th>
                  <th className="p-3">{t("unitPrice")}</th>
                  <th className="p-3">{t("leadTimeDays")}</th>
                </tr>
              </thead>
              <tbody>
                {quotations.flatMap((q) =>
                  q.lines.map((line) => (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="p-3">{q.supplierName}</td>
                      <td className="p-3">{line.itemDescription}</td>
                      <td className="p-3">{line.qty}</td>
                      <td className="p-3">{line.unitPrice ?? "—"}</td>
                      <td className="p-3">{line.leadTimeDays ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EvaluationApprovalPanel
        sourcingRequestId={id}
        status={request.status}
        quotationOptions={quotationOptions}
        latestEvaluationId={evaluation?.id ?? null}
      />

      {procurementCase && (
        <ProcurementCasePanel
          procurementCase={procurementCase}
          linkedPurchaseOrders={procurementCaseDetail?.linkedPurchaseOrders}
        />
      )}
    </div>
  )
}
