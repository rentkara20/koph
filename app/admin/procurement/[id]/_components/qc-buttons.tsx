"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { qcAsset } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"

export function QcButtons({ assetId }: { assetId: string }) {
  const t = useTranslations("procurement.pickup")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showIssue, setShowIssue] = useState(false)
  const [reason, setReason] = useState("")
  const [details, setDetails] = useState("")

  const run = (pass: boolean, notes?: string) =>
    startTransition(async () => {
      const res = await qcAsset(assetId, pass, notes)
      if (res.error) {
        toast.error(translateActionError(res.error))
        return
      }
      toast.success(t("qcDone"))
      setShowIssue(false)
      router.refresh()
    })

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(true)}>
          {t("qcPass")}
        </Button>
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => setShowIssue(true)}>
          {t("qcFail")}
        </Button>
      </div>

      {showIssue && (
        <div className="min-w-64 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <label className="block text-xs font-medium" htmlFor={`qc-reason-${assetId}`}>
            {t("qcIssueReason")}
          </label>
          <select
            id={`qc-reason-${assetId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t("qcChooseReason")}</option>
            <option value={t("qcReasons.damaged")}>{t("qcReasons.damaged")}</option>
            <option value={t("qcReasons.specMismatch")}>{t("qcReasons.specMismatch")}</option>
            <option value={t("qcReasons.missingAccessories")}>{t("qcReasons.missingAccessories")}</option>
            <option value={t("qcReasons.serialMismatch")}>{t("qcReasons.serialMismatch")}</option>
            <option value={t("qcReasons.other")}>{t("qcReasons.other")}</option>
          </select>
          <Textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder={t("qcIssueDetails")}
            maxLength={400}
            className="min-h-20"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setShowIssue(false)}>
              {t("qcCancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || !reason}
              onClick={() => run(false, [reason, details.trim()].filter(Boolean).join(": "))}
            >
              {t("qcRecordIssue")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
