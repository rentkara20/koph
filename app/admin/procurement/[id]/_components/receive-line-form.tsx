"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { receivePurchaseOrderLine } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"

export function ReceiveLineForm({
  purchaseOrderLineId,
  pickupTaskId,
}: {
  purchaseOrderLineId: string
  // When receiving units that arrived via a supplier pickup, attribute the
  // receipt to that task so its collected count and auto-close stay correct.
  pickupTaskId?: string
}) {
  const t = useTranslations("procurement")
  const router = useRouter()
  const [serialNumber, setSerialNumber] = useState("")
  const [assetTag, setAssetTag] = useState("")
  const [pending, startTransition] = useTransition()

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
