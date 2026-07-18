import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MessageCircle, Smartphone } from "lucide-react"
import { getProcurementFulfilment } from "@/lib/actions/procurement-case"
import { getProcurementCase } from "@/lib/actions/procurement-case"
import { getPartnersWithContracts } from "@/lib/actions/tasks"
import { Badge } from "@/components/ui/badge"
import { ProcurementCasePanel } from "@/components/procurement-case-panel"
import { unitStatusVariant } from "@/lib/utils/order-status"
import {
  OPEN_PICKUP_TASK_STATUSES,
  plannableQty,
  canCloseProcurementCase,
} from "@/lib/domain/procurement-fulfilment"
import { ReceiveLineForm } from "./_components/receive-line-form"
import { CancelLineForm } from "./_components/cancel-line-form"
import { PoMilestoneActions } from "./_components/po-milestone-actions"
import { CreatePickupForm } from "./_components/create-pickup-form"
import { QcButtons } from "./_components/qc-buttons"
import { QcBulkActions } from "./_components/qc-bulk-actions"
import { getSupplier } from "@/lib/actions/suppliers"
import { getOperationalMessageTemplates } from "@/lib/actions/settings"
import { renderMessageTemplate } from "@/lib/domain/message-templates"
import { buildWhatsappUrl, taskLink } from "@/lib/utils/whatsapp"
import { getPurchaseOrder } from "@/lib/actions/procurement"
import { deriveReceivingContinuation } from "@/lib/domain/receiving-continuation"
import { isQcClear, isQcFailedStatus, summarizeQcAssets } from "@/lib/domain/qc-summary"
import { WorkflowContinuationCard } from "@/components/workflow-continuation-card"
import { getSupplierReturnsForPurchaseOrder } from "@/lib/actions/supplier-returns"
import { hasUnresolvedSupplierReturns } from "@/lib/domain/supplier-return"
import { poStatusVariant as PO_STATUS_VARIANT, pickupTaskStatusVariant as TASK_STATUS_VARIANT } from "@/lib/domain/status-variant"

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [t, tNext, tAssets, data, poContext, partners, supplierReturnRecords] = await Promise.all([
    getTranslations("procurement"),
    getTranslations("workspace.nextActions"),
    getTranslations("assets"),
    getProcurementFulfilment(id),
    getPurchaseOrder(id),
    getPartnersWithContracts(),
    getSupplierReturnsForPurchaseOrder(id),
  ])
  if (!data) notFound()
  const { po, procurementCase, lines, pickupTasks, taskLines, assets, stage, rollup } = data
  const [supplier, messageTemplates] = await Promise.all([
    getSupplier(po.supplierId),
    getOperationalMessageTemplates(),
  ])
  const p = (k: string, v?: Record<string, string | number>) => t(`pickup.${k}` as never, v as never)

  const procurementCaseData = po.procurementCaseId ? await getProcurementCase(po.procurementCaseId) : null

  // Planned quantity per line still held by open pickup tasks — drives plannable.
  const openTaskIds = new Set(
    pickupTasks.filter((tk) => (OPEN_PICKUP_TASK_STATUSES as readonly string[]).includes(tk.status)).map((tk) => tk.id)
  )
  const openPlannedByLine = new Map<string, number>()
  for (const tl of taskLines) {
    if (openTaskIds.has(tl.pickupTaskId)) {
      openPlannedByLine.set(tl.purchaseOrderLineId, (openPlannedByLine.get(tl.purchaseOrderLineId) ?? 0) + tl.qtyPlanned)
    }
  }

  const pickupLineOptions = lines.map((l) => ({
    id: l.id,
    itemDescription: l.itemDescription,
    plannable: plannableQty(
      { status: l.status, qtyOrdered: l.qtyOrdered, qtyPickedUp: l.qtyPickedUp, qtyReceived: l.qtyReceived },
      openPlannedByLine.get(l.id) ?? 0
    ),
  }))

  const canClose = canCloseProcurementCase({
    caseStatus: procurementCase?.status ?? "open",
    po: { status: po.status, paidAt: po.paidAt, readyForPickupAt: po.readyForPickupAt },
    lines: lines.map((l) => ({ status: l.status, qtyOrdered: l.qtyOrdered, qtyPickedUp: l.qtyPickedUp, qtyReceived: l.qtyReceived })),
    pickupTasks,
  })

  const assetsByLine = new Map<string, typeof assets>()
  for (const a of assets) {
    if (!a.purchaseOrderLineId) continue
    const arr = assetsByLine.get(a.purchaseOrderLineId) ?? []
    arr.push(a)
    assetsByLine.set(a.purchaseOrderLineId, arr)
  }
  const taskLinesByTask = new Map<string, typeof taskLines>()
  for (const tl of taskLines) {
    const arr = taskLinesByTask.get(tl.pickupTaskId) ?? []
    arr.push(tl)
    taskLinesByTask.set(tl.pickupTaskId, arr)
  }
  const lineDescById = new Map(lines.map((l) => [l.id, l.itemDescription]))
  const qcSummary = summarizeQcAssets(assets)
  const failedAsset = assets.find((asset) => isQcFailedStatus(asset.status))
  const deliverableCount = assets.filter((asset) => asset.status === "in_stock").length
  const continuation = deriveReceivingContinuation({
    purchaseOrderId: po.id,
    qcPending: qcSummary.pending,
    qcFailed: qcSummary.failed,
    deliverableCount,
    failedAssetId: failedAsset?.id,
    linkedOrderNumber: poContext?.linkedOrder?.orderNumber ?? null,
  })

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight" dir="ltr">
            {po.poNumber}
          </h1>
          <p className="text-sm text-muted-foreground">{data.po ? "" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{p(`stages.${stage}`)}</Badge>
          <Badge variant={PO_STATUS_VARIANT[po.status] ?? "secondary"}>{t(`statuses.${po.status}` as never)}</Badge>
        </div>
      </div>

      {/* Quantity dashboard */}
      <div className="grid grid-cols-4 gap-3">
        {([
          ["ordered", rollup.ordered],
          ["qtyPickedUp", rollup.pickedUp],
          ["received", rollup.received],
          ["remainingQty", rollup.remaining],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-3 text-center">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{p(label)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {po.paidAt && <Badge variant="success">{p("paid")}</Badge>}
        {po.readyForPickupAt && <Badge variant="default">{p("readyForPickup")}</Badge>}
        {po.qcRequired && <Badge variant="warning">{p("qcRequired")}</Badge>}
      </div>

      {(po.qcRequired || qcSummary.pending > 0 || qcSummary.failed > 0) && (
        <section id="quality-inspection" className="scroll-mt-24 space-y-4 rounded-2xl border bg-card p-4">
          <div>
            <h2 className="font-semibold">{p("qcInspection")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{p("qcInspectionHint")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {([
              ["qcTotal", qcSummary.total, ""],
              ["qcPending", qcSummary.pending, "text-warning"],
              ["qcPassed", qcSummary.passed, "text-success"],
              ["qcFailed", qcSummary.failed, "text-destructive"],
              ["qcReturned", qcSummary.returnedToSupplier, "text-muted-foreground"],
            ] as const).map(([label, value, color]) => (
              <div key={label} className="rounded-xl border p-3 text-center">
                <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{p(label)}</p>
              </div>
            ))}
          </div>
          {qcSummary.failed > 0 && (
            <p className={`rounded-lg border p-3 text-sm ${deliverableCount > 0 ? "border-warning/30 bg-warning/5" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
              {p(deliverableCount > 0 ? "qcPartialAllowed" : "qcDeliveryBlocked")}
            </p>
          )}
          <QcBulkActions assetIds={assets.filter((asset) => asset.status === "receiving_qc").map((asset) => asset.id)} />
        </section>
      )}

      {po.status === "received" && rollup.remaining === 0 && (
        <WorkflowContinuationCard
          title={t("mobileReceiving.nextStep")}
          description={t(`mobileReceiving.${continuation.key}Hint` as never)}
          actionLabel={tNext(continuation.key)}
          href={continuation.href}
        />
      )}

      {po.status !== "cancelled" && rollup.remaining > 0 && (
        <ButtonLink href={`/admin/procurement/${po.id}/receive`}>
          <Smartphone className="size-4" />
          {t("mobileReceiving.openMobile")}
        </ButtonLink>
      )}

      <PoMilestoneActions
        purchaseOrderId={po.id}
        procurementCaseId={po.procurementCaseId}
        paid={Boolean(po.paidAt)}
        ready={Boolean(po.readyForPickupAt)}
        qcRequired={po.qcRequired}
        canClose={canClose && isQcClear(qcSummary) && !hasUnresolvedSupplierReturns(supplierReturnRecords)}
        poStatus={po.status}
      />

      {procurementCaseData && (
        <ProcurementCasePanel
          procurementCase={procurementCaseData.procurementCase}
          linkedPurchaseOrders={procurementCaseData.linkedPurchaseOrders}
          sourceRequests={procurementCaseData.sourceRequests}
        />
      )}

      {/* Lines with per-line qty */}
      <div className="space-y-4">
        {lines.map((line) => {
          const cancelled = line.status === "cancelled"
          const canCancel = !cancelled && line.qtyReceived === 0 && line.qtyPickedUp === 0 && po.status !== "cancelled"
          const lineAssets = assetsByLine.get(line.id) ?? []
          return (
            <div key={line.id} className={`space-y-3 rounded-xl border bg-card p-4 ${cancelled ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={`font-medium ${cancelled ? "line-through" : ""}`}>{line.itemDescription}</p>
                  <p className="text-xs text-muted-foreground">{[line.brand, line.model].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex gap-3 text-xs tabular-nums text-muted-foreground">
                  <span>{p("ordered")}: {line.qtyOrdered}</span>
                  <span>{p("qtyPickedUp")}: {line.qtyPickedUp}</span>
                  <span>{p("received")}: {line.qtyReceived}</span>
                </div>
              </div>

              {canCancel && <CancelLineForm purchaseOrderLineId={line.id} />}

              {lineAssets.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{t("receivedUnits")}</p>
                  <ul className="space-y-1">
                    {lineAssets.map((u) => (
                      <li key={u.id} className="flex items-center gap-2 text-xs">
                        <Link href={`/admin/assets/${u.id}`} className="font-mono text-kara-purple hover:underline" dir="ltr">
                          {u.assetTag ?? u.id}
                        </Link>
                        <span className="text-muted-foreground" dir="ltr">{u.serialNumber}</span>
                        <Badge variant={unitStatusVariant[u.status] ?? "outline"}>
                          {tAssets(`statuses.${u.status}` as never)}
                        </Badge>
                        {u.status === "receiving_qc" && <QcButtons assetId={u.id} />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Create pickup task */}
      {po.readyForPickupAt ? (
        <CreatePickupForm
          purchaseOrderId={po.id}
          lines={pickupLineOptions}
          partners={partners.map((pt) => ({
            id: pt.id,
            name: pt.name,
            contracts: pt.contracts
              .filter((c) => c.contractId)
              .map((c) => ({ id: c.contractId as string, name: c.contractName ?? "" })),
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{p("noReadyPo")}</p>
      )}

      {/* Pickup tasks */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{p("pickupTasks")}</h2>
        {pickupTasks.length === 0 && <p className="text-sm text-muted-foreground">{p("noPickupTasks")}</p>}
        {pickupTasks.map((tk) => {
          const tls = taskLinesByTask.get(tk.id) ?? []
          const inTransit = tk.status === "picked_up"
          const pickupMessage = renderMessageTemplate(messageTemplates.partnerPickup, {
            partner_name: tk.partnerName ?? "",
            po_number: po.poNumber,
            supplier_name: supplier?.name ?? "",
            pickup_address: supplier?.address ?? "",
            pickup_contact: [supplier?.pickupContactName, supplier?.pickupContactMobile].filter(Boolean).join(" - "),
            destination: tk.destinationLocation ?? "main_warehouse",
            items: tls.map((line) => `${line.qtyPlanned}× ${lineDescById.get(line.purchaseOrderLineId) ?? ""}`).join("، "),
            task_link: taskLink(tk.taskToken),
          })
          const pickupWhatsappUrl = buildWhatsappUrl(tk.partnerMobile, pickupMessage)
          return (
            <div key={tk.id} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{tk.partnerName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">→ {tk.destinationLocation ?? "main_warehouse"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={TASK_STATUS_VARIANT[tk.status] ?? "secondary"}>
                    {tk.status === "picked_up" ? p("inTransit") : tk.status}
                  </Badge>
                  <Link href={`/task/${tk.taskToken}`} target="_blank" className="text-xs text-kara-purple hover:underline">
                    {p("openLink")}
                  </Link>
                  {pickupWhatsappUrl && (
                    <a href={pickupWhatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700">
                      <MessageCircle className="size-3" /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
              <ul className="space-y-2">
                {tls.map((tl) => {
                  const remainingToReceive = tl.qtyPickedUp - tl.qtyReceived
                  return (
                    <li key={tl.id} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>{lineDescById.get(tl.purchaseOrderLineId)}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {p("collectedOf", { picked: tl.qtyPickedUp, planned: tl.qtyPlanned })} · {p("received")}: {tl.qtyReceived}
                        </span>
                      </div>
                      {inTransit && remainingToReceive > 0 && (
                        <div className="mt-2">
                          <ReceiveLineForm purchaseOrderLineId={tl.purchaseOrderLineId} pickupTaskId={tk.id} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Direct receive (no pickup workflow) — kept for supplier drop-off */}
      {po.status !== "cancelled" && stage !== "closed" && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{t("receive")}</h2>
          {lines
            .filter((l) => l.status !== "cancelled" && l.qtyReceived < l.qtyOrdered)
            .map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                <span className="text-xs">{l.itemDescription}</span>
                <ReceiveLineForm purchaseOrderLineId={l.id} />
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function ButtonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
    >
      {children}
    </Link>
  )
}
