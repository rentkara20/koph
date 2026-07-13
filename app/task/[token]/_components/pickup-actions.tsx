"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateTaskByToken } from "@/lib/actions/tasks"
import { markPickupCollectedByToken } from "@/lib/actions/procurement-pickup"
import { translateActionError } from "@/lib/i18n/action-errors"

interface PlannedLine {
  id: string // pickup_task_line id
  itemDescription: string
  qtyPlanned: number
}

export function PickupActions({
  token,
  status,
  lines,
}: {
  token: string
  status: string
  lines: PlannedLine[]
}) {
  const t = useTranslations("tasks.pickup")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.qtyPlanned)]))
  )

  const simple = (action: "accept" | "reject" | "mark_arrived", ok: string) =>
    startTransition(async () => {
      const res = await updateTaskByToken(token, action)
      if (res.error) {
        toast.error(translateActionError(res.error))
        return
      }
      toast.success(ok)
      router.refresh()
    })

  function collect() {
    const payload = lines.map((l) => ({
      pickupTaskLineId: l.id,
      qtyPickedUp: Math.max(0, parseInt(qty[l.id] ?? "0", 10) || 0),
    }))
    startTransition(async () => {
      const res = await markPickupCollectedByToken(token, { lines: payload })
      if (res.error) {
        toast.error(res.error === "PHOTO_REQUIRED" ? t("photosRequired") : translateActionError(res.error))
        return
      }
      toast.success(t("collected"))
      router.refresh()
    })
  }

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button className="flex-1" disabled={pending} onClick={() => simple("accept", t("accepted"))}>
          {pending && <Loader2 className="me-1.5 size-4 animate-spin" />}
          {t("accept")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => simple("reject", t("reject"))}>
          {t("reject")}
        </Button>
      </div>
    )
  }

  if (status === "accepted") {
    return (
      <Button className="w-full" disabled={pending} onClick={() => simple("mark_arrived", t("arrivedDone"))}>
        {pending && <Loader2 className="me-1.5 size-4 animate-spin" />}
        {t("arrived")}
      </Button>
    )
  }

  if (status === "arrived") {
    return (
      <div className="space-y-3">
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{l.itemDescription}</p>
              <p className="text-xs text-muted-foreground">
                {t("planned")}: {l.qtyPlanned}
              </p>
            </div>
            <Input
              type="number"
              min={0}
              max={l.qtyPlanned}
              value={qty[l.id] ?? ""}
              onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
              className="h-9 w-24"
              dir="ltr"
            />
          </div>
        ))}
        <Button className="w-full" disabled={pending} onClick={collect}>
          {pending && <Loader2 className="me-1.5 size-4 animate-spin" />}
          {t("confirmPickup")}
        </Button>
      </div>
    )
  }

  if (status === "picked_up") {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-center text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        {t("inTransitNote")}
      </p>
    )
  }

  return null
}
