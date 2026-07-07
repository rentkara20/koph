"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, RefreshCw } from "lucide-react"
import { syncAssetsToNotion } from "@/lib/actions/notion-sync"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"

export function SyncNotionButton() {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const result = await syncAssetsToNotion()
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    toast.success(`Synced ${result.synced ?? 0} assets${result.failed ? `, ${result.failed} failed` : ""}`)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="size-3.5" aria-hidden />
      )}
      Sync to Notion
    </Button>
  )
}
