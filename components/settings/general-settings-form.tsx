"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateRequestTaskSettings, type RequestTaskSettings } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"

export function GeneralSettingsForm({ initial }: { initial: RequestTaskSettings }) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const result = await updateRequestTaskSettings(values)
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="photoCount" className="text-xs">
            Required delivery photos
          </Label>
          <Input
            id="photoCount"
            type="number"
            min={0}
            max={10}
            value={values.requiredDeliveryPhotoCount}
            onChange={(e) =>
              setValues((v) => ({ ...v, requiredDeliveryPhotoCount: Number(e.target.value) }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Photos a partner must upload before marking delivery done. 0 disables the requirement.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="taskTtl" className="text-xs">
            Task link expiry (days)
          </Label>
          <Input
            id="taskTtl"
            type="number"
            min={1}
            max={30}
            value={values.taskTokenTtlDays}
            onChange={(e) => setValues((v) => ({ ...v, taskTokenTtlDays: Number(e.target.value) }))}
          />
          <p className="text-xs text-muted-foreground">
            How long a partner&apos;s magic task link stays valid.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="activationTtl" className="text-xs">
            Activation link expiry (hours)
          </Label>
          <Input
            id="activationTtl"
            type="number"
            min={1}
            max={24 * 14}
            value={values.activationTokenTtlHours}
            onChange={(e) =>
              setValues((v) => ({ ...v, activationTokenTtlHours: Number(e.target.value) }))
            }
          />
          <p className="text-xs text-muted-foreground">
            How long a partner&apos;s account activation link stays valid.
          </p>
        </div>
      </div>

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </form>
  )
}
