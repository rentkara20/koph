"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { decideCommercialApproval, handoffToProcurementCase } from "@/lib/actions/commercial-approval"
import { translateActionError } from "@/lib/i18n/action-errors"

type QuotationOption = { id: string; supplierName: string | null }

export function EvaluationApprovalPanel({
  status,
  latestEvaluationId,
}: {
  status: string
  quotationOptions: QuotationOption[]
  latestEvaluationId: string | null
}) {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  function run(action: () => Promise<{ error?: string }>, successKey: string, actionKey: string) {
    setError("")
    setPendingAction(actionKey)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t(successKey as never))
      router.refresh()
    })
  }

  if (status === "under_evaluation" && latestEvaluationId) {
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">{t("decideApproval")}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => decideCommercialApproval({ evaluationId: latestEvaluationId, decision: "approved" }),
                "approvalDecided",
                "approve"
              )
            }
          >
            {pending && pendingAction === "approve" && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => decideCommercialApproval({ evaluationId: latestEvaluationId, decision: "rejected" }),
                "approvalDecided",
                "reject"
              )
            }
          >
            {pending && pendingAction === "reject" && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("reject")}
          </Button>
        </div>
      </div>
    )
  }

  if (status === "approved" && latestEvaluationId) {
    return (
      <div className="space-y-3 rounded-lg border p-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => handoffToProcurementCase({ evaluationId: latestEvaluationId }), "handedOff", "handoff")}
        >
          {pending && <Loader2 className="me-2 size-4 animate-spin" />}
          {t("handoff")}
        </Button>
      </div>
    )
  }

  return null
}
