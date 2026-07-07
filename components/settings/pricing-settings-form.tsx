"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updatePricingPaymentSettings, type PricingPaymentSettings } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"

export function PricingSettingsForm({ initial }: { initial: PricingPaymentSettings }) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const result = await updatePricingPaymentSettings(values)
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
      } else {
        toast.success("Settings saved")
        router.refresh()
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="tzOffset" className="text-xs">
          Business month timezone offset (UTC)
        </Label>
        <Input
          id="tzOffset"
          type="number"
          min={-12}
          max={14}
          value={values.businessMonthOffsetHours}
          onChange={(e) =>
            setValues((v) => ({ ...v, businessMonthOffsetHours: Number(e.target.value) }))
          }
        />
        <p className="text-xs text-muted-foreground">
          Which calendar month a partner payment is batched into is based on this offset (e.g. +3
          for Riyadh). A sign-off right after local midnight can land in the wrong month if this
          is off.
        </p>
      </div>

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </form>
  )
}
