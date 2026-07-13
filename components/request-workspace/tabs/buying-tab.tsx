import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BlockerCard } from "../next-action-button"
import { formatDate } from "@/lib/utils/format"

// Buying: sourcing requests, ERP references (the word "case" is never
// rendered), and purchase orders with receiving progress. Summary cards
// linking out to the existing detail pages (full inline editing is P3+).
export async function BuyingTab({ workspace }: { workspace: RequestWorkspace }) {
  const [t, tSourcing, tProcurement, tCase] = await Promise.all([
    getTranslations("workspace"),
    getTranslations("sourcing"),
    getTranslations("procurement"),
    getTranslations("procurementCase"),
  ])
  const erpBlockers = workspace.nextActions.filter((a) => a.key === "addErpPoReference")

  return (
    <div className="space-y-4">
      {erpBlockers.map((action) => (
        <BlockerCard key={action.entityRef.id} action={action} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("buying.sourcing")}</CardTitle>
        </CardHeader>
        <CardContent>
          {workspace.sourcing.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("buying.noSourcing")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {workspace.sourcing.map((s) => (
                <li
                  key={s.id}
                  className="relative flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/sourcing/${s.id}`}
                      className="font-medium after:absolute after:inset-0"
                    >
                      {s.title || t("buying.sourcingRequest")}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t("buying.sourcingCounts", {
                        items: s.itemCount,
                        rfqs: s.rfqCount,
                        quotes: s.quotationCount,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {formatDate(s.createdAt)}
                    </span>
                    <Badge variant="outline">{tSourcing(`statuses.${s.status}`)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {workspace.erpReferences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("buying.erpReferences")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("buying.erpReferencesHint")}</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {workspace.erpReferences.map((ref) => (
                <li
                  key={ref.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {ref.supplierName ?? t("buying.erpReference")}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {ref.externalPoRef
                        ? `${ref.erpSystem ? ref.erpSystem.toUpperCase() + " · " : ""}${ref.externalPoRef}`
                        : t("buying.awaitingErpRef")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ref.poId ? (
                      <Link
                        href={`/admin/procurement/${ref.poId}`}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("buying.viewPurchaseOrder")}
                      </Link>
                    ) : ref.externalPoRef ? (
                      <Link
                        href={`/admin/procurement/new?case=${encodeURIComponent(ref.id)}`}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("nextActions.createPurchaseOrder")}
                      </Link>
                    ) : null}
                    <Badge variant="outline">{tCase(`statuses.${ref.status}`)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("buying.purchaseOrders")}</CardTitle>
        </CardHeader>
        <CardContent>
          {workspace.purchaseOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("buying.noPurchaseOrders")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {workspace.purchaseOrders.map((po) => (
                <li
                  key={po.id}
                  className="relative flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/procurement/${po.id}`}
                      className="font-mono font-medium after:absolute after:inset-0"
                      dir="ltr"
                    >
                      {po.poNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {po.supplierName ?? "—"}
                      {po.orderedAt ? ` · ${formatDate(po.orderedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t("buying.received", { received: po.qtyReceived, ordered: po.qtyOrdered })}
                    </span>
                    <Badge variant="outline">{tProcurement(`statuses.${po.status}`)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
