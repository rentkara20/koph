"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Loader2, Pencil, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { renameAsset } from "@/lib/actions/assets"
import { translateActionError } from "@/lib/i18n/action-errors"

type Props = {
  assetId: string
  /** Name currently shown — the override when set, otherwise the source line text. */
  displayName: string
  /** Origin order/PO line description, shown as the revert target. */
  sourceName: string | null
  /** Whether this asset carries its own name (order_unit.model). */
  hasOverride: boolean
}

export function AssetNameForm({ assetId, displayName, sourceName, hasOverride }: Props) {
  const t = useTranslations("assets")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(displayName)
  const [loading, setLoading] = useState(false)

  async function save(value: string) {
    setLoading(true)
    const result = await renameAsset(assetId, value)
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    setEditing(false)
    toast.success(t("nameSaved"))
    router.refresh()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === displayName) {
      setEditing(false)
      return
    }
    void save(trimmed)
  }

  if (!editing) {
    return (
      <div className="mt-1 flex items-start gap-2">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName}</h1>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="mt-0.5 size-7 shrink-0 text-muted-foreground"
          aria-label={t("editName")}
          title={t("editName")}
          onClick={() => {
            setName(displayName)
            setEditing(true)
          }}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1 space-y-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor="asset-name" className="sr-only">
          {t("editName")}
        </label>
        <input
          id="asset-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false)
          }}
          maxLength={200}
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" variant="default" className="size-8 shrink-0" disabled={loading} aria-label={t("save")}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          disabled={loading}
          aria-label={tCommon("cancel")}
          onClick={() => setEditing(false)}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("nameHint")}</p>
      {hasOverride && sourceName && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void save("")}
          className="inline-flex items-center gap-1.5 text-xs text-kara-blue hover:underline disabled:opacity-50"
        >
          <RotateCcw className="size-3" aria-hidden />
          {t("resetToSourceName", { name: sourceName })}
        </button>
      )}
    </form>
  )
}
