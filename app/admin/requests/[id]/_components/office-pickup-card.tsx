"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Store } from "lucide-react"
import { completeOfficePickup } from "@/lib/actions/office-pickup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"

// Recording a handover the customer collected in person. A courier delivery is
// closed by signing off the partner's task; a counter handover has no task, so
// without this control the request can never leave draft and its devices stay
// "assigned" while physically with the customer.
export function OfficePickupCard({
  requestId,
  deviceCount,
  hasOpenTask,
  hasSignature,
}: {
  requestId: string
  deviceCount: number
  hasOpenTask: boolean
  hasSignature: boolean
}) {
  const t = useTranslations("requests")
  const router = useRouter()
  const [notes, setNotes] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    const result = await completeOfficePickup(requestId, notes.trim() || undefined)
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    setConfirming(false)
    setNotes("")
    toast.success(t("officePickupDone", { count: result.delivered ?? deviceCount }))
    router.refresh()
  }

  if (deviceCount === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("officePickupDescription")}</p>

      {hasOpenTask ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {t("officePickupBlockedByTask")}
        </p>
      ) : (
        <>
          {!hasSignature && (
            <p className="text-sm text-amber-700 dark:text-amber-500">{t("officePickupNoSignature")}</p>
          )}
          {confirming && (
            <div className="max-w-md space-y-1.5">
              <Label htmlFor="pickup-notes">{t("officePickupNotes")}</Label>
              <Input
                id="pickup-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("officePickupNotesHint")}
              />
            </div>
          )}
          <Button
            onClick={() => (confirming ? submit() : setConfirming(true))}
            disabled={loading}
            variant={confirming ? "default" : "outline"}
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Store className="size-4" aria-hidden />}
            {confirming ? t("officePickupConfirm", { count: deviceCount }) : t("officePickupAction")}
          </Button>
        </>
      )}
    </div>
  )
}
