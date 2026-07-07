"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateIntegrationSettings, type IntegrationSettings } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function IntegrationSettingsForm({ initial }: { initial: IntegrationSettings }) {
  const router = useRouter()
  const [forceDisabled, setForceDisabled] = useState(initial.notionSyncForceDisabled)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    setSaving(true)
    const next = !forceDisabled
    try {
      const result = await updateIntegrationSettings({ notionSyncForceDisabled: next })
      if (result.error) {
        toast.error(result.error)
      } else {
        setForceDisabled(next)
        toast.success(next ? "Notion sync paused" : "Notion sync resumed")
        router.refresh()
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const effectivelyOn = initial.notionConfigured && !forceDisabled

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">Notion asset mirror</span>
        <Badge variant={effectivelyOn ? "success" : "secondary"}>
          {!initial.notionConfigured ? "Not configured" : effectivelyOn ? "Active" : "Paused"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {initial.notionConfigured
          ? "NOTION_API_KEY and NOTION_DATA_SOURCE_ID are set. Use this switch to pause the one-way KOPH → Notion asset mirror without redeploying."
          : "Set NOTION_API_KEY and NOTION_DATA_SOURCE_ID in the environment to enable this integration."}
      </p>
      {initial.notionConfigured && (
        <Button variant="outline" size="sm" onClick={toggle} disabled={saving}>
          {saving ? "Saving…" : forceDisabled ? "Resume sync" : "Pause sync"}
        </Button>
      )}
    </div>
  )
}
