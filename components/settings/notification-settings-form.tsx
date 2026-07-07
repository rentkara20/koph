"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateNotificationSettings, type NotificationSettings } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"

export function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const result = await updateNotificationSettings(values)
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
        <Label htmlFor="retentionDays" className="text-xs">
          Notification retention (days)
        </Label>
        <Input
          id="retentionDays"
          type="number"
          min={7}
          max={365}
          value={values.retentionDays}
          onChange={(e) => setValues((v) => ({ ...v, retentionDays: Number(e.target.value) }))}
        />
        <p className="text-xs text-muted-foreground">
          Notifications older than this are deleted weekly to keep the table lean.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.weeklyDigestEnabled}
          onChange={(e) => setValues((v) => ({ ...v, weeklyDigestEnabled: e.target.checked }))}
          className="size-4 accent-primary"
        />
        Send weekly ops digest email to admins
      </label>

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </form>
  )
}
