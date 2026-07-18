import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import Link from "next/link"
import { getSourcingRequest } from "@/lib/actions/sourcing"
import { getQuotationsForSourcingRequest, getSourcingComparisonMatrix } from "@/lib/actions/quotations"
import { getLatestCommercialEvaluation, getSourcingAwards } from "@/lib/actions/commercial-approval"
import { getProcurementCasesForSourcingRequest } from "@/lib/actions/procurement-case"
import { getSuppliers } from "@/lib/actions/suppliers"
import { Badge } from "@/components/ui/badge"
import { buildRfqMessages } from "@/lib/domain/rfq-message"
import { getRfqMessageTemplates } from "@/lib/actions/settings"
import { canSendEmailFromKoph } from "@/lib/actions/communications"
import { SendRfqForm } from "./_components/send-rfq-form"
import { RfqMessageActions } from "./_components/rfq-message-actions"
import { QuotationForm } from "./_components/quotation-form"
import { AwardPanel } from "./_components/award-panel"
import { EvaluationApprovalPanel } from "./_components/evaluation-approval-panel"
import { procurementCaseHref } from "@/lib/domain/procurement-case-navigation"
import { WorkflowContinuationCard } from "@/components/workflow-continuation-card"
import { cn } from "@/lib/utils"
import { sourcingStatusVariant as STATUS_VARIANT, sourcingItemStatusVariant as ITEM_STATUS_VARIANT } from "@/lib/domain/status-variant"

export default async function SourcingRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [t, format, data] = await Promise.all([
    getTranslations("sourcing"),
    getFormatter(),
    getSourcingRequest(id),
  ])
  if (!data) notFound()
  const { request, items, rfqs, rfqItemIds } = data

  const [quotations, evaluation, awards, matrix, procurementCases, suppliers, messageTemplates, emailSendingEnabled] = await Promise.all([
    getQuotationsForSourcingRequest(id),
    getLatestCommercialEvaluation(id),
    getSourcingAwards(id),
    getSourcingComparisonMatrix(id),
    getProcurementCasesForSourcingRequest(id),
    getSuppliers(),
    getRfqMessageTemplates(),
    canSendEmailFromKoph(),
  ])

  const quotationOptions = quotations.map((q) => ({ id: q.quotation.id, supplierName: q.supplierName }))
  const hasCandidates = matrix.some((row) => row.candidates.length > 0)
  const canAward = hasCandidates && (request.status === "quotes_received" || request.status === "under_evaluation")
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

      {/* Workflow continuation: once sourcing is handed off, the remaining work
          lives on the procurement case — walk the user straight there. */}
      {request.status === "handed_off" && procurementCases.length > 0 && (
        <WorkflowContinuationCard
          title={t("nextStepPoTitle")}
          description={t("nextStepPoDescription")}
          actionLabel={t("nextStepPoAction")}
          href={procurementCaseHref(procurementCases[0].id)}
        />
      )}

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
          <div>
            <p className="text-sm font-medium">{t("rfqHistory")}</p>
            <p className="text-xs text-muted-foreground">
              {t("rfqSummary", {
                total: rfqs.length,
                responded: rfqs.filter((r) => r.status === "responded").length,
                awaiting: rfqs.filter((r) => r.status === "sent").length,
              })}
            </p>
          </div>
          {rfqs.map((rfq) => {
            const isAwaiting = rfq.status === "sent"
            const rfqItems = (rfqItemIds[rfq.id] ?? [])
              .map((itemId) => itemById.get(itemId))
              .filter((item) => item != null)
            const messages = buildRfqMessages(
              {
                supplierContactName: rfq.supplierContactPerson,
                externalRef: request.externalRef,
                title: request.title,
                items: rfqItems,
              },
              messageTemplates
            )
            return (
              <div
                key={rfq.id}
                className={cn(
                  "space-y-2 rounded-lg border p-3",
                  // The supplier we're still waiting on is what needs attention;
                  // answered RFQs recede.
                  isAwaiting && "border-amber-500/40 bg-amber-500/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm">{rfq.supplierName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(rfq.sentAt), { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <Badge variant={rfq.status === "responded" ? "success" : isAwaiting ? "warning" : "secondary"}>
                    {isAwaiting ? t("awaitingReply") : t(`rfqStatuses.${rfq.status}` as never)}
                  </Badge>
                </div>
                {rfqItems.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {rfqItems[0].quantity}× {rfqItems[0].supplierDescription}
                    {rfqItems.length > 1 && <span> · {t("andMoreItems", { count: rfqItems.length - 1 })}</span>}
                  </p>
                )}
                {rfq.status === "sent" && rfqItems.length > 0 && (
                  <RfqMessageActions
                    sourcingRequestId={id}
                    whatsappBody={messages.whatsappBody}
                    emailSubject={messages.emailSubject}
                    emailBody={messages.emailBody}
                    mobile={rfq.supplierMobile}
                    email={rfq.supplierEmail}
                    emailSendingEnabled={emailSendingEnabled}
                  />
                )}
                {rfq.status === "sent" && rfqItems.length > 0 && (
                  <QuotationForm
                    rfqId={rfq.id}
                    items={rfqItems.map((item) => ({
                      id: item.id,
                      quantity: item.quantity,
                      supplierDescription: item.supplierDescription,
                      partNumber: item.partNumber,
                    }))}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {canAward && <AwardPanel matrix={matrix} />}

      {awards && awards.lines.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("awards")}
            {awards.approvalDecision === "approved" && (
              <Badge variant="success" className="ms-2 text-[10px]">
                {t("locked")}
              </Badge>
            )}
          </p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3">{t("itemDescription")}</th>
                  <th className="p-3">{t("supplier")}</th>
                  <th className="p-3">{t("unitPrice")}</th>
                  <th className="p-3">{t("reason")}</th>
                </tr>
              </thead>
              <tbody>
                {awards.lines.map((line) => (
                  <tr key={line.itemId} className="border-b last:border-0 align-top">
                    <td className="p-3">
                      {line.quantity}× {line.itemDescription}
                    </td>
                    <td className="p-3">{line.supplierName}</td>
                    <td className="p-3" dir="ltr">
                      {line.unitPrice != null ? `${line.unitPrice} ${line.currency ?? "SAR"}` : "—"}
                    </td>
                    <td className="p-3">{t(`awardReasons.${line.reason}` as never)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EvaluationApprovalPanel
        status={request.status}
        quotationOptions={quotationOptions}
        latestEvaluationId={evaluation?.id ?? null}
      />

      {procurementCases.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("procurementCases")}</p>
          <div className="space-y-2">
            {procurementCases.map((pc) => (
              <Link
                key={pc.id}
                href={procurementCaseHref(pc.id)}
                className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm">{pc.supplierName ?? t("noSupplier")}</p>
                  {pc.externalPoRef && (
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {pc.externalPoRef}
                    </p>
                  )}
                </div>
                <Badge variant={pc.status === "po_linked" ? "success" : "secondary"}>
                  {t(`caseStatuses.${pc.status}` as never)}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
