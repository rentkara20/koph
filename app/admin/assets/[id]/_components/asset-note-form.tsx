"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { addAssetNote } from "@/lib/actions/assets"
import { translateActionError } from "@/lib/i18n/action-errors"

export function AssetNoteForm({ assetId }: { assetId: string }) {
  const t = useTranslations("assets")
  const router = useRouter()
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setLoading(true)
    const result = await addAssetNote(assetId, note)
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    setNote("")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="asset-note" className="sr-only">
        {t("addNote")}
      </label>
      <input
        id="asset-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("notePlaceholder")}
        maxLength={1000}
        className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button type="submit" size="sm" variant="outline" disabled={loading || !note.trim()} className="gap-1.5">
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <MessageSquarePlus className="size-3.5" aria-hidden />
        )}
        {t("save")}
      </Button>
    </form>
  )
}
