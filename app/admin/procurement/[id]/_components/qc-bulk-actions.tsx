"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { qcAssets } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"

export function QcBulkActions({ assetIds }: { assetIds: string[] }) {
  const t = useTranslations("procurement.pickup")
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  if (assetIds.length < 2) return null

  const approveAll = () =>
    startTransition(async () => {
      const result = await qcAssets(assetIds, true)
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("qcAllPassed"))
      setConfirming(false)
      router.refresh()
    })

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3">
        <p className="me-auto text-sm">{t("qcConfirmAll", { count: assetIds.length })}</p>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          {t("qcCancel")}
        </Button>
        <Button size="sm" disabled={pending} onClick={approveAll}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("qcConfirm")}
        </Button>
      </div>
    )
  }

  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      {t("qcPassAll", { count: assetIds.length })}
    </Button>
  )
}
