"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { transitionAsset } from "@/lib/actions/assets"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { AssetAction } from "@/lib/domain/asset-status"

// Actions that end the asset's life get a confirm + required-notes treatment.
const DESTRUCTIVE: AssetAction[] = ["retire", "sell", "mark_lost", "mark_damaged"]

export function AssetActions({
  assetId,
  actions,
}: {
  assetId: string
  actions: AssetAction[]
}) {
  const t = useTranslations("assets")
  const router = useRouter()
  const [pending, setPending] = useState<AssetAction | null>(null)
  const [confirming, setConfirming] = useState<AssetAction | null>(null)
  const [notes, setNotes] = useState("")

  async function run(action: AssetAction) {
    setPending(action)
    const result = await transitionAsset(assetId, action, notes.trim() || undefined)
    setPending(null)
    setConfirming(null)
    setNotes("")
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    toast.success(t(`actionLabels.${action}`))
    router.refresh()
  }

  function handleClick(action: AssetAction) {
    if (DESTRUCTIVE.includes(action) && confirming !== action) {
      setConfirming(action)
      return
    }
    run(action)
  }

  if (actions.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={DESTRUCTIVE.includes(a) ? "destructive" : "outline"}
            onClick={() => handleClick(a)}
            disabled={pending !== null}
            aria-pressed={confirming === a}
          >
            {pending === a && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {confirming === a ? t("confirmAction", { action: t(`actionLabels.${a}`) }) : t(`actionLabels.${a}`)}
          </Button>
        ))}
      </div>
      {confirming && (
        <div aria-live="polite">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("actionNotes")}
            className="w-full max-w-sm rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>
  )
}
