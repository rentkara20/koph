import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
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

const PO_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  ordered: "default",
  partially_received: "warning",
  received: "success",
  cancelled: "destructive",
}

const TASK_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  pending: "secondary",
  accepted: "default",
  arrived: "default",
  picked_up: "warning",
  closed: "success",
  rejected: "destructive",
  failed: "destructive",
  cancelled: "destructive",
}

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [t, data, partners] = await Promise.all([
    getTranslations("procurement"),
    getProcurementFulfilment(id),
    getPartnersWithContracts(),
  ])
  if (!data) notFound()
  const { po, procurementCase, lines, pickupTasks, taskLines, assets, stage, rollup } = data
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

      <PoMilestoneActions
        purchaseOrderId={po.id}
        procurementCaseId={po.procurementCaseId}
        paid={Boolean(po.paidAt)}
        ready={Boolean(po.readyForPickupAt)}
        qcRequired={po.qcRequired}
        canClose={canClose}
        poStatus={po.status}
      />

      {procurementCaseData && (
        <ProcurementCasePanel
          procurementCase={procurementCaseData.procurementCase}
          linkedPurchaseOrders={procurementCaseData.linkedPurchaseOrders}
        />
      )}

      {/* Lines with per-line qty */}
      <div className="space-y-4">
        {lines.map((line) => {
          const cancelled = line.status === "cancelled"
          const fullyReceived = line.qtyReceived >= line.qtyOrdered
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
                        <Badge variant={unitStatusVariant[u.status] ?? "outline"}>{u.status}</Badge>
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
