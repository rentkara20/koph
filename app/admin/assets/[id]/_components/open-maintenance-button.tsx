"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Wrench } from "lucide-react"
import { openMaintenanceOrder } from "@/lib/actions/maintenance"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function OpenMaintenanceButton({ assetId }: { assetId: string }) {
  const t = useTranslations("maintenance")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [issue, setIssue] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!issue.trim()) return
    setLoading(true)
    const result = await openMaintenanceOrder(assetId, issue.trim())
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    setOpen(false)
    setIssue("")
    toast.success(t("opened"))
    router.refresh()
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Wrench className="size-3.5" aria-hidden />
        {t("openOrder")}
      </Button>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-2" aria-live="polite">
      <Textarea
        value={issue}
        onChange={(e) => setIssue(e.target.value)}
        placeholder={t("issue")}
        rows={2}
        autoFocus
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="bg-kara-purple hover:bg-kara-purple/90"
          onClick={handleSubmit}
          disabled={loading || !issue.trim()}
        >
          {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {t("openOrder")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
          ✕
        </Button>
      </div>
    </div>
  )
}
