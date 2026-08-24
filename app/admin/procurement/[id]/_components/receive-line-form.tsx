"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { receivePurchaseOrderLine, receivePurchaseOrderLineQty } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"

export function ReceiveLineForm({
  purchaseOrderLineId,
  pickupTaskId,
  requiresSerial = true,
  remaining,
}: {
  purchaseOrderLineId: string
  // When receiving units that arrived via a supplier pickup, attribute the
  // receipt to that task so its collected count and auto-close stay correct.
  pickupTaskId?: string
  // Accessories (cables, adapters) carry no serial: the warehouse confirms a
  // quantity instead of scanning each unit.
  requiresSerial?: boolean
  remaining?: number
}) {
  const t = useTranslations("procurement")
  const router = useRouter()
  const [serialNumber, setSerialNumber] = useState("")
  const [assetTag, setAssetTag] = useState("")
  const [qty, setQty] = useState("1")
  const [pending, startTransition] = useTransition()

  const parsedQty = Number.parseInt(qty, 10)
  const qtyValid = Number.isInteger(parsedQty) && parsedQty >= 1 && (remaining === undefined || parsedQty <= remaining)

  function handleSubmit() {
    if (!serialNumber.trim()) return
    startTransition(async () => {
      const result = await receivePurchaseOrderLine({
        purchaseOrderLineId,
        serialNumber: serialNumber.trim(),
        assetTag: assetTag.trim() || undefined,
        pickupTaskId,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("lineReceived"))
      setSerialNumber("")
      setAssetTag("")
      router.refresh()
    })
  }

  function handleSubmitQty() {
    if (!qtyValid) return
    startTransition(async () => {
      const result = await receivePurchaseOrderLineQty({
        purchaseOrderLineId,
        qty: parsedQty,
        pickupTaskId,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("qtyReceivedCount", { count: parsedQty }))
      setQty("1")
      router.refresh()
    })
  }

  if (!requiresSerial) {
    return (
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
        <div>
          <Input
            type="number"
            min={1}
            max={remaining}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            dir="ltr"
            className="h-8 w-24"
          />
        </div>
        <span className="text-xs text-muted-foreground">{t("noSerialHint")}</span>
        <Button size="sm" onClick={handleSubmitQty} disabled={pending || !qtyValid}>
          {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
          {t("receiveQty")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
      <div>
        <Input
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
          placeholder={t("scanSerialPlaceholder")}
          dir="ltr"
          className="h-8 w-48"
        />
      </div>
      <div>
        <Input
          value={assetTag}
          onChange={(e) => setAssetTag(e.target.value)}
          placeholder="KARA-00001"
          dir="ltr"
          className="h-8 w-36"
        />
      </div>
      <Button size="sm" onClick={handleSubmit} disabled={pending || !serialNumber.trim()}>
        {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
        {t("receive")}
      </Button>
    </div>
  )
}
