import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getPurchaseOrder, getReceivedUnitsForLine } from "@/lib/actions/procurement"
import { Badge } from "@/components/ui/badge"
import { ReceiveLineForm } from "./_components/receive-line-form"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  ordered: "default",
  partially_received: "warning",
  received: "success",
  cancelled: "destructive",
}

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [t, data] = await Promise.all([getTranslations("procurement"), getPurchaseOrder(id)])
  if (!data) notFound()
  const { po, lines } = data

  const receivedByLine = await Promise.all(
    lines.map(async (line) => ({ lineId: line.id, units: await getReceivedUnitsForLine(line.id) }))
  )
  const receivedMap = new Map(receivedByLine.map((r) => [r.lineId, r.units]))

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight" dir="ltr">
            {po.poNumber}
          </h1>
          <p className="text-sm text-muted-foreground">{po.supplierName}</p>
        </div>
        <Badge variant={STATUS_VARIANT[po.status] ?? "secondary"}>{t(`statuses.${po.status}` as never)}</Badge>
      </div>

      <div className="space-y-4">
        {lines.map((line) => {
          const units = receivedMap.get(line.id) ?? []
          const fullyReceived = line.qtyReceived >= line.qtyOrdered
          return (
            <div key={line.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{line.itemDescription}</p>
                  <p className="text-xs text-muted-foreground">
                    {[line.brand, line.model].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge variant={fullyReceived ? "success" : "secondary"}>
                  {fullyReceived
                    ? t("fullyReceived")
                    : t("remaining", { received: line.qtyReceived, ordered: line.qtyOrdered })}
                </Badge>
              </div>

              {!fullyReceived && po.status !== "cancelled" && (
                <ReceiveLineForm purchaseOrderLineId={line.id} />
              )}

              {units.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{t("receivedUnits")}</p>
                  <ul className="space-y-1">
                    {units.map((u) => (
                      <li key={u.id} className="flex items-center gap-2 text-xs">
                        <Link href={`/admin/assets/${u.id}`} className="font-mono text-kara-purple hover:underline" dir="ltr">
                          {u.assetTag ?? u.id}
                        </Link>
                        <span className="text-muted-foreground" dir="ltr">
                          {u.serialNumber}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
