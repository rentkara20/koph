"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { startMaintenanceWork, closeMaintenanceOrder } from "@/lib/actions/maintenance"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function MaintenanceRowActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("maintenance")
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [closing, setClosing] = useState(false)
  const [cost, setCost] = useState("")
  const [vendorNotes, setVendorNotes] = useState("")

  async function handleStart() {
    setLoading(true)
    const result = await startMaintenanceWork(id)
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    router.refresh()
  }

  async function handleClose(outcome: "done" | "cancelled") {
    setLoading(true)
    const result = await closeMaintenanceOrder(id, outcome, {
      cost: cost ? Number(cost) : undefined,
      vendorNotes: vendorNotes.trim() || undefined,
    })
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    setClosing(false)
    toast.success(t(outcome === "done" ? "closedDone" : "closedCancelled"))
    router.refresh()
  }

  if (status === "done" || status === "cancelled") {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  if (closing) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5" aria-live="polite">
        <Input
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder={t("cost")}
          inputMode="decimal"
          className="h-8 w-24"
        />
        <Input
          value={vendorNotes}
          onChange={(e) => setVendorNotes(e.target.value)}
          placeholder={t("vendorNotes")}
          className="h-8 w-32"
        />
        <Button size="sm" variant="outline" onClick={() => handleClose("cancelled")} disabled={loading}>
          {t("markCancelled")}
        </Button>
        <Button
          size="sm"
          className="bg-kara-purple hover:bg-kara-purple/90"
          onClick={() => handleClose("done")}
          disabled={loading}
        >
          {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {t("markDone")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex justify-end gap-1.5">
      {status === "open" && (
        <Button size="sm" variant="outline" onClick={handleStart} disabled={loading}>
          {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {t("start")}
        </Button>
      )}
      <Button size="sm" className="bg-kara-purple hover:bg-kara-purple/90" onClick={() => setClosing(true)}>
        {t("close")}
      </Button>
    </div>
  )
}
