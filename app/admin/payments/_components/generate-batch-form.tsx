"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { generateBatch } from "@/lib/actions/payments"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

type PendingRow = {
  partnerId: string
  partnerName: string | null
  period: string
  totalAmount: number
  paymentCount: number
}

export function GenerateBatchForm({ pending }: { pending: PendingRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    const fd = new FormData(e.currentTarget)
    const combo = fd.get("combo") as string
    if (!combo) return

    const [partnerId, period] = combo.split("|")
    setLoading(true)
    const result = await generateBatch(partnerId, period)
    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setOpen(false)
    router.push(`/admin/payments/${result.id}`)
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={pending.length === 0}>
        <Plus className="size-3.5" />
        Generate batch
        {pending.length === 0 && (
          <span className="ml-1 text-xs text-muted-foreground">(no pending payments)</span>
        )}
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border p-4 space-y-3 max-w-md">
      <p className="text-sm font-medium">Generate payment batch</p>
      <Separator />

      <div className="space-y-1.5">
        <label className="text-xs font-medium">
          Partner &amp; period <span className="text-destructive">*</span>
        </label>
        <Select name="combo" required defaultValue="">
          <option value="">— Select —</option>
          {pending.map((row) => (
            <option key={`${row.partnerId}-${row.period}`} value={`${row.partnerId}|${row.period}`}>
              {row.partnerName ?? "—"} — {row.period} ({row.paymentCount} payment
              {row.paymentCount !== 1 ? "s" : ""}, SAR {row.totalAmount.toFixed(2)})
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setError("") }}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  )
}
