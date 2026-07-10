"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { assignWarranty, activateWarranty } from "@/lib/actions/warranty"
import { translateActionError } from "@/lib/i18n/action-errors"
import { formatDate } from "@/lib/utils/format"
import type { getWarrantyForAsset } from "@/lib/actions/warranty"

type Warranty = Awaited<ReturnType<typeof getWarrantyForAsset>>
type BatchOption = { id: string; productNameEn: string; unitsCovered: number; unitsAssigned: number }

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  assigned_not_activated: "warning",
  activation_pending: "warning",
  active: "success",
  expired: "destructive",
  cancelled: "secondary",
  unknown: "secondary",
}

export function WarrantyCard({
  assetId,
  warranty,
  batches,
}: {
  assetId: string
  warranty: Warranty
  batches: BatchOption[]
}) {
  const t = useTranslations("warranty")
  const router = useRouter()
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "")
  const [dueDate, setDueDate] = useState("")
  const [pending, startTransition] = useTransition()

  function handleAssign() {
    if (!batchId) return
    startTransition(async () => {
      const result = await assignWarranty({ assetId, warrantyBatchId: batchId, activationDueAt: dueDate || undefined })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("warrantyAssigned"))
      router.refresh()
    })
  }

  function handleActivate() {
    if (!warranty) return
    startTransition(async () => {
      const result = await activateWarranty(warranty.id)
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("warrantyActivated"))
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">{t("card")}</h2>

      {!warranty ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("noWarranty")}</p>
          {batches.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-xs">{t("batch")}</Label>
                <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="h-8">
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.productNameEn} ({b.unitsAssigned}/{b.unitsCovered})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("activationDueAt")}</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8" />
              </div>
              <Button size="sm" onClick={handleAssign} disabled={pending || !batchId}>
                {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
                {t("assign")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              {warranty.productNameEn}
              {warranty.providerName ? ` · ${warranty.providerName}` : ""}
            </p>
            <Badge variant={STATUS_VARIANT[warranty.status] ?? "secondary"}>
              {t(`statuses.${warranty.status}` as never)}
            </Badge>
          </div>
          {warranty.startAt && (
            <p className="text-xs text-muted-foreground">
              {t("startDate")}: {formatDate(warranty.startAt)} · {t("endDate")}:{" "}
              {warranty.endAt ? formatDate(warranty.endAt) : "—"}
            </p>
          )}
          {["assigned_not_activated", "activation_pending"].includes(warranty.status) && (
            <Button size="sm" onClick={handleActivate} disabled={pending}>
              {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
              {t("activate")}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
