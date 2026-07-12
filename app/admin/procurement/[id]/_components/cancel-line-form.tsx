"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cancelPurchaseOrderLine } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"

export function CancelLineForm({ purchaseOrderLineId }: { purchaseOrderLineId: string }) {
  const t = useTranslations("procurement")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelPurchaseOrderLine({
        purchaseOrderLineId,
        reason: reason.trim() || undefined,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("lineCancelled"))
      setOpen(false)
      setReason("")
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        {t("cancelLine")}
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-destructive/30 p-2.5">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("cancelReasonPlaceholder")}
        className="h-8 w-56"
      />
      <Button size="sm" variant="destructive" onClick={handleCancel} disabled={pending}>
        {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
        {t("confirmCancelLine")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
        {t("dismiss")}
      </Button>
    </div>
  )
}
