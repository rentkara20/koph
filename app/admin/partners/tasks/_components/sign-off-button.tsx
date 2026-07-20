"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { signOffTask } from "@/lib/actions/tasks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { translateActionError } from "@/lib/i18n/action-errors"

// Sign-off control for an ad-hoc task. Mirrors the request-task SignOffButton in
// requests/[id]/_components/tasks-section.tsx (payment decision → close). Kept
// standalone because ad-hoc tasks have their own admin surface, not the request
// page. isOverride handles closing a mistakenly-failed task.
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
  const [decision, setDecision] = useState<"full" | "partial" | "none" | "hold">("full")
  const [approvedAmount, setApprovedAmount] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const needsQty = pricingModel === "per_day" || pricingModel === "per_hour" || pricingModel === "per_item"

  const parsedQty = qty ? parseFloat(qty) : null
  const total =
    unitPrice != null
      ? needsQty
        ? parsedQty != null && parsedQty > 0
          ? parsedQty * unitPrice
          : null
        : unitPrice
      : null

  const canConfirm =
    !(needsQty && !qty) &&
    !(decision === "partial" && (!approvedAmount || !reason.trim())) &&
    !(decision === "none" && !reason.trim())

  async function handleSignOff() {
    setLoading(true)
    try {
      const result = await signOffTask(taskId, {
        decision,
        quantity: needsQty && qty ? parseInt(qty) : undefined,
        approvedAmount: decision === "partial" ? parseFloat(approvedAmount) : undefined,
        reason: reason.trim() || undefined,
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

  return (
    <div className="flex flex-col gap-2">
      {isOverride && <span className="text-xs text-destructive">{t("overrideWarning")}</span>}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={decision}
          onChange={(e) => setDecision(e.target.value as typeof decision)}
          className="h-7 w-28 text-xs"
        >
          <option value="full">{t("fullPayment")}</option>
          <option value="partial">{t("partialPayment")}</option>
          <option value="none">{t("noPayment")}</option>
          <option value="hold">{t("holdPayment")}</option>
        </Select>
        {needsQty && decision !== "hold" && (
          <Input
            type="number"
            min={1}
            placeholder={t("quantity")}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-7 w-20 text-xs"
          />
        )}
        {decision === "partial" && (
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder={t("approvedAmount")}
            value={approvedAmount}
            onChange={(e) => setApprovedAmount(e.target.value)}
            className="h-7 w-28 text-xs"
          />
        )}
        {total != null && decision === "full" && (
          <span className="text-xs tabular-nums text-muted-foreground">SAR {total.toFixed(2)}</span>
        )}
      </div>
      {(decision === "partial" || decision === "none" || decision === "hold") && (
        <Textarea
          placeholder={t("reasonRequired")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-14 text-xs"
        />
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={loading || !canConfirm} onClick={handleSignOff}>
          {loading ? "…" : t("confirm")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  )
}
