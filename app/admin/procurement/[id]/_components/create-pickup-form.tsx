"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createPickupTask } from "@/lib/actions/procurement-pickup"
import { translateActionError } from "@/lib/i18n/action-errors"

interface LineOption {
  id: string
  itemDescription: string
  plannable: number
}
interface PartnerOption {
  id: string
  name: string
  contracts: { id: string; name: string }[]
}

export function CreatePickupForm({
  purchaseOrderId,
  lines,
  partners,
}: {
  purchaseOrderId: string
  lines: LineOption[]
  partners: PartnerOption[]
}) {
  const t = useTranslations("procurement.pickup")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [partnerId, setPartnerId] = useState("")
  const [contractId, setContractId] = useState("")
  const [destination, setDestination] = useState("main_warehouse")
  const [qty, setQty] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const selectedPartner = partners.find((p) => p.id === partnerId)
  const plannableLines = lines.filter((l) => l.plannable > 0)

  function submit() {
    const planned = plannableLines
      .map((l) => ({ purchaseOrderLineId: l.id, qtyPlanned: parseInt(qty[l.id] ?? "", 10) }))
      .filter((l) => Number.isFinite(l.qtyPlanned) && l.qtyPlanned > 0)
    if (!partnerId || planned.length === 0) return
    startTransition(async () => {
      const res = await createPickupTask({
        purchaseOrderId,
        partnerId,
        contractId: contractId || undefined,
        destinationLocation: destination.trim() || undefined,
        lines: planned,
      })
      if (res.error) {
        toast.error(translateActionError(res.error))
        return
      }
      toast.success(t("pickupTaskCreated"))
      setOpen(false)
      setQty({})
      setPartnerId("")
      setContractId("")
      router.refresh()
    })
  }

  if (plannableLines.length === 0) return null

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="me-1.5 size-3.5" />
        {t("createPickupTask")}
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("partner")}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2"
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value)
              setContractId("")
            }}
          >
            <option value="">{t("selectPartner")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {selectedPartner && selectedPartner.contracts.length > 0 && (
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Contract</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            >
              <option value="">—</option>
              {selectedPartner.contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("destinationWarehouse")}</span>
          <Input value={destination} onChange={(e) => setDestination(e.target.value)} className="h-9" />
        </label>
      </div>

      <div className="space-y-2">
        {plannableLines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{l.itemDescription}</p>
              <p className="text-xs text-muted-foreground">
                {t("remainingQty")}: {l.plannable}
              </p>
            </div>
            <Input
              type="number"
              min={0}
              max={l.plannable}
              value={qty[l.id] ?? ""}
              onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
              placeholder={t("planPlaceholder")}
              className="h-9 w-28"
              dir="ltr"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !partnerId}>
          {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
          {t("createPickupTask")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          ✕
        </Button>
      </div>
    </div>
  )
}
