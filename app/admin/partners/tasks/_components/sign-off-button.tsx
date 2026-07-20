"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { signOffTask } from "@/lib/actions/tasks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { translateActionError } from "@/lib/i18n/action-errors"

// Ad-hoc sign-off: a trip is always priced by its contract, so there is no
// payment-decision matrix — one tap confirms the visit happened and pays the
// contract amount (decision="full"). Only quantity-based contracts prompt for a
// quantity. isOverride closes a mistakenly-failed task.
export function AdHocSignOffButton({
  taskId,
  pricingModel,
  unitPrice,
  isOverride,
}: {
  taskId: string
  pricingModel: string | null
  unitPrice: number | null
  isOverride?: boolean
}) {
  const router = useRouter()
  const t = useTranslations("tasks")
  const tToast = useTranslations("toast")
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState("")
  const [loading, setLoading] = useState(false)
  const needsQty = pricingModel === "per_day" || pricingModel === "per_hour" || pricingModel === "per_item"

  const parsedQty = qty ? parseFloat(qty) : null
  const amount =
    unitPrice != null
      ? needsQty
        ? parsedQty != null && parsedQty > 0
          ? parsedQty * unitPrice
          : null
        : unitPrice
      : null

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await signOffTask(taskId, {
        decision: "full",
        quantity: needsQty && qty ? parseInt(qty) : undefined,
      })
      if (result?.error) {
        toast.error(translateActionError(result.error))
        setLoading(false)
        return
      }
      toast.success(tToast("taskSignedOff"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant={isOverride ? "outline" : "default"} onClick={() => setOpen(true)}>
        {isOverride ? t("forceComplete") : t("signoff")}
      </Button>
    )
  }

  const label =
    amount != null ? t("adHocConfirmPay", { amount: `SAR ${amount.toFixed(2)}` }) : t("confirm")

  return (
    <div className="flex flex-col items-end gap-2">
      {isOverride && <span className="text-xs text-destructive">{t("overrideWarning")}</span>}
      {needsQty && (
        <Input
          type="number"
          min={1}
          placeholder={t("quantity")}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-8 w-24 text-xs"
        />
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={loading || (needsQty && !qty)} onClick={handleConfirm}>
          {loading ? "…" : label}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  )
}
