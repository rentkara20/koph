"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  createFollowUpDeliveryTask,
  getRemainingQuantitiesForRequest,
  resolveRequestAfterPartialDelivery,
  acceptPartialDeliveryAsFinal,
} from "@/lib/actions/tasks"
import { translateActionError } from "@/lib/i18n/action-errors"

type PartnerData = {
  id: string
  name: string
  contracts: {
    partnerId: string
    contractId: string | null
    contractName: string | null
    pricingModel: string | null
    unitPrice: number | null
  }[]
}

type RemainingItem = {
  requestItemId: string
  description: string
  quantity: number
  deliveredQuantity: number
  remaining: number
}

// Minimum usable split-delivery slice: create a follow-up task for whatever
// quantity remains, and resolve an on_hold request after a partial/refused
// delivery. Serial entry/review and snapshot amendments are deferred — this
// only allocates plain quantities.
export function FollowUpDeliveryButton({
  requestId,
  partners,
}: {
  requestId: string
  partners: PartnerData[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState<RemainingItem[] | null>(null)
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({})
  const [partnerId, setPartnerId] = useState("")
  const [contractId, setContractId] = useState("")
  const [notes, setNotes] = useState("")

  const selectedPartner = partners.find((p) => p.id === partnerId)

  async function handleOpen() {
    setOpen(true)
    const rows = await getRemainingQuantitiesForRequest(requestId)
    setRemaining(rows)
    const initialQty: Record<string, string> = {}
    for (const r of rows) if (r.remaining > 0) initialQty[r.requestItemId] = String(r.remaining)
    setQtyByItem(initialQty)
  }

  function handlePartnerChange(id: string) {
    setPartnerId(id)
    // Never let a contract from the previous partner remain selected.
    setContractId("")
  }

  async function handleSubmit() {
    const items = Object.entries(qtyByItem)
      .map(([requestItemId, qty]) => ({ requestItemId, qty: parseInt(qty, 10) || 0 }))
      .filter((i) => i.qty > 0)

    if (!partnerId) { toast.error("Select a partner"); return }
    if (!items.length) { toast.error("Enter at least one quantity to allocate"); return }

    setLoading(true)
    const result = await createFollowUpDeliveryTask(requestId, {
      partnerId,
      contractId: contractId || undefined,
      notes: notes.trim() || undefined,
      items,
    })
    if (result.error) {
      toast.error(translateActionError(result.error))
      setLoading(false)
      return
    }
    toast.success("Follow-up delivery created")
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={handleOpen}>
        Create Follow-up Delivery
      </Button>
    )
  }

  const remainingItems = (remaining ?? []).filter((r) => r.remaining > 0)

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="text-sm font-medium">Create Follow-up Delivery</p>
      <Separator />

      {remaining === null ? (
        <p className="text-xs text-muted-foreground">Loading remaining quantities…</p>
      ) : remainingItems.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing remaining to allocate on this request.</p>
      ) : (
        <div className="space-y-2">
          {remainingItems.map((r) => (
            <div key={r.requestItemId} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex-1">
                {r.description}{" "}
                <span className="text-muted-foreground">
                  ({r.deliveredQuantity}/{r.quantity} delivered, {r.remaining} remaining)
                </span>
              </span>
              <Input
                type="number"
                min={0}
                max={r.remaining}
                value={qtyByItem[r.requestItemId] ?? ""}
                onChange={(e) =>
                  setQtyByItem((prev) => ({ ...prev, [r.requestItemId]: e.target.value }))
                }
                className="h-7 w-20 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Partner <span className="text-destructive">*</span></Label>
        <Select value={partnerId} onChange={(e) => handlePartnerChange(e.target.value)}>
          <option value="">— Select partner —</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      {selectedPartner && selectedPartner.contracts.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Contract <span className="text-xs text-muted-foreground">(review before confirming)</span></Label>
          <Select value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">— No contract —</option>
            {selectedPartner.contracts.map((c) => (
              <option key={c.contractId} value={c.contractId!}>
                {c.contractName} ({c.pricingModel?.replace(/_/g, " ")})
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="button" size="sm" disabled={loading || remainingItems.length === 0} onClick={handleSubmit}>
          {loading ? "…" : "Create task"}
        </Button>
      </div>
    </div>
  )
}

// Shown on an on_hold request so a partial/refused delivery doesn't dead-end.
export function PartialResolutionPanel({
  requestId,
  requestStatus,
  partners,
}: {
  requestId: string
  requestStatus: string
  partners: PartnerData[]
}) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)

  if (requestStatus !== "on_hold") return null

  async function handleResolve(resolution: "rescheduled" | "cancelled" | "failed") {
    setLoading(true)
    const result = await resolveRequestAfterPartialDelivery(requestId, resolution)
    if (result.error) { toast.error(translateActionError(result.error)); setLoading(false); return }
    toast.success("Request status updated")
    router.refresh()
  }

  async function handleAcceptPartial() {
    if (!reason.trim()) { toast.error("A reason is required"); return }
    setLoading(true)
    const result = await acceptPartialDeliveryAsFinal(requestId, reason.trim())
    if (result.error) { toast.error(translateActionError(result.error)); setLoading(false); return }
    toast.success("Request marked as completed")
    router.refresh()
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="text-sm font-medium">Resolve partial delivery</p>
      <Separator />

      <FollowUpDeliveryButton requestId={requestId} partners={partners} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={loading} onClick={() => handleResolve("rescheduled")}>
          Mark rescheduled
        </Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => handleResolve("cancelled")}>
          Mark cancelled
        </Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => handleResolve("failed")}>
          Mark failed
        </Button>
      </div>

      <div className="space-y-1.5 pt-2 border-t">
        <Label className="text-xs">Accept partial as final <span className="text-xs text-muted-foreground">(waives remaining quantity — reason required)</span></Label>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the remaining quantity being waived?" />
        <div className="flex justify-end">
          <Button size="sm" disabled={loading || !reason.trim()} onClick={handleAcceptPartial}>
            Accept partial as final
          </Button>
        </div>
      </div>
    </div>
  )
}
