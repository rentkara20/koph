import { notFound } from "next/navigation"
import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { MapPin, Phone } from "lucide-react"
import { getPickupTaskByToken } from "@/lib/actions/procurement-pickup"
import { getTaskPhotosByToken } from "@/lib/actions/tasks"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { PhotoUpload } from "./photo-upload"
import { PickupActions } from "./pickup-actions"

// Supplier-pickup partner view. Shows the supplier pickup location/contact and
// the expected items, and drives Accept → Arrived → Picked Up. The partner can
// never complete the procurement — after pickup the task shows "in transit".
export async function PickupTaskView({ token }: { token: string }) {
  const [data, t, tStatus, photos] = await Promise.all([
    getPickupTaskByToken(token),
    getTranslations("tasks.pickup"),
    getTranslations("tasks.status"),
    getTaskPhotosByToken(token),
  ])
  if (!data) notFound()

  const { task, po, supplier, partner, lines, isExpired } = data
  const isTerminal = ["closed", "rejected", "failed", "cancelled"].includes(task.status)
  const canAct = !isTerminal && !isExpired
  const showPhotos = task.status === "arrived" && task.photoRequired

  const plannedLines = lines.map((l) => ({
    id: l.id,
    itemDescription: l.poLine?.itemDescription ?? "—",
    qtyPlanned: l.qtyPlanned,
  }))

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="sticky top-0 z-20 bg-kara-purple text-white shadow-[0_2px_8px_rgba(81,43,131,0.25)]">
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-3">
          <Image src="/kara-logo-light.png" alt="KARA" width={74} height={32} className="h-7 w-auto" priority />
          <span className="font-mono text-xs text-white/85" dir="ltr">{po.poNumber}</span>
          <div className="ms-auto flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{tStatus(task.status)}</span>
            <LocaleToggle onDark />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 p-4">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{partner?.name}</p>
        </div>

        {/* Supplier pickup location + contact */}
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">{t("supplier")}</p>
          <p className="font-medium">{supplier?.name}</p>
          {supplier?.address && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {supplier.address}
            </p>
          )}
          {(supplier?.pickupContactName || supplier?.pickupContactMobile) && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="size-4 shrink-0" />
              {[supplier?.pickupContactName, supplier?.pickupContactMobile].filter(Boolean).join(" · ")}
            </p>
          )}
          {supplier?.pickupMapsUrl && (
            <a href={supplier.pickupMapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-kara-purple hover:underline">
              {t("mapsLink")}
            </a>
          )}
          <p className="pt-1 text-xs text-muted-foreground">
            {t("destination")}: {task.destinationLocation ?? "main_warehouse"}
          </p>
        </div>

        {/* Expected items */}
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">{t("expectedItems")}</p>
          <ul className="space-y-1">
            {plannedLines.map((l) => (
              <li key={l.id} className="flex justify-between text-sm">
                <span>{l.itemDescription}</span>
                <span className="tabular-nums text-muted-foreground">×{l.qtyPlanned}</span>
              </li>
            ))}
          </ul>
        </div>

        {showPhotos && <PhotoUpload token={token} existingPhotos={photos} />}

        {canAct && <PickupActions token={token} status={task.status} lines={plannedLines} />}
      </div>
    </div>
  )
}
