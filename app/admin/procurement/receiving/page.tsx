import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getInTransitPickupTasks } from "@/lib/actions/procurement-pickup"
import { getQcQueue } from "@/lib/actions/procurement"
import { Badge } from "@/components/ui/badge"
import { QcButtons } from "../[id]/_components/qc-buttons"

// Warehouse worklist: pickups in transit awaiting receipt + the QC queue.
export default async function WarehouseReceivingPage() {
  const [t, inTransit, qcQueue] = await Promise.all([
    getTranslations("procurement.pickup"),
    getInTransitPickupTasks(),
    getQcQueue(),
  ])

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("inTransit")}</h1>
      </div>

      <section className="space-y-3">
        {inTransit.length === 0 && <p className="text-sm text-muted-foreground">{t("noPickupTasks")}</p>}
        {inTransit.map((tk) => (
          <Link
            key={tk.id}
            href={`/admin/procurement/${tk.purchaseOrderId}`}
            className="flex items-center justify-between rounded-xl border bg-card p-4 hover:bg-muted/40"
          >
            <div>
              <p className="font-mono text-sm" dir="ltr">{tk.poNumber}</p>
              <p className="text-xs text-muted-foreground">
                {tk.supplierName} · {tk.partnerName} → {tk.destinationLocation ?? "main_warehouse"}
              </p>
            </div>
            <Badge variant="warning">{t("inTransit")}</Badge>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("qcQueue")}</h2>
        {qcQueue.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
        {qcQueue.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2 text-sm">
              <Link href={`/admin/assets/${a.id}`} className="font-mono text-kara-purple hover:underline" dir="ltr">
                {a.assetTag ?? a.id}
              </Link>
              <span className="text-muted-foreground" dir="ltr">{a.serialNumber}</span>
              <span className="text-xs text-muted-foreground">{a.poNumber}</span>
            </div>
            <QcButtons assetId={a.id} />
          </div>
        ))}
      </section>
    </div>
  )
}
