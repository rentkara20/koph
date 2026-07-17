"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  markPurchaseOrderPaid,
  markReadyForPickup,
  setPurchaseOrderQcRequired,
} from "@/lib/actions/procurement"
import { closeProcurementCase } from "@/lib/actions/procurement-case"
import { translateActionError } from "@/lib/i18n/action-errors"

interface Props {
  purchaseOrderId: string
  procurementCaseId: string | null
  paid: boolean
  ready: boolean
  qcRequired: boolean
  canClose: boolean
  poStatus: string
}

export function PoMilestoneActions({
  purchaseOrderId,
  procurementCaseId,
  paid,
  ready,
  qcRequired,
  canClose,
  poStatus,
}: Props) {
  const t = useTranslations("procurement.pickup")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn()
      if (res.error) {
        toast.error(translateActionError(res.error))
        return
      }
      toast.success(ok)
      router.refresh()
    })

  const canMilestone = poStatus === "ordered" || poStatus === "partially_received"

  return (
    <div className="flex flex-wrap gap-2">
      {!paid && poStatus !== "cancelled" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => markPurchaseOrderPaid(purchaseOrderId), t("markPaidDone"))}>
          {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
          {t("markPaid")}
        </Button>
      )}
      {!ready && canMilestone && (
        <Button size="sm" disabled={pending} onClick={() => run(() => markReadyForPickup(purchaseOrderId), t("readyDone"))}>
          {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
          {t("markReadyForPickup")}
        </Button>
      )}
      {canMilestone && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setPurchaseOrderQcRequired(purchaseOrderId, !qcRequired), t("qcDone"))}
        >
          {qcRequired ? t("disableQc") : t("enableQc")}
        </Button>
      )}
      {canClose && procurementCaseId && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => closeProcurementCase(procurementCaseId), t("caseClosed"))}>
          {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
          {t("closeCase")}
        </Button>
      )}
    </div>
  )
}
