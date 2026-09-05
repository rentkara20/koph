"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createAsset, searchOrderLinesForAssetCreation } from "@/lib/actions/assets"
import { translateActionError } from "@/lib/i18n/action-errors"

type LineOption = Awaited<ReturnType<typeof searchOrderLinesForAssetCreation>>[number]

export function CreateAssetForm() {
  const t = useTranslations("assets")
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<LineOption[]>([])
  const [selected, setSelected] = useState<LineOption | null>(null)
  const [serialNumber, setSerialNumber] = useState("")
  const [assetTag, setAssetTag] = useState("")
  const [ownership, setOwnership] = useState<"kara" | "customer" | "supplier">("kara")
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  // A device we do not own has no order line of ours to hang off, so the form
  // swaps the line picker for typed device identity — without a brand/model
  // the asset would list with a blank name (there is no origin line to read
  // one from) and be unfindable.
  const isKara = ownership === "kara"
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()

  async function handleSearch(value: string) {
    setQuery(value)
    setSelected(null)
    if (!value.trim()) {
      setOptions([])
      return
    }
    setSearching(true)
    const results = await searchOrderLinesForAssetCreation(value)
    setSearching(false)
    setOptions(results)
  }

  const canSubmit = serialNumber.trim() !== "" && (isKara ? Boolean(selected) : model.trim() !== "")

  function handleSubmit() {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await createAsset(
        isKara
          ? {
              orderLineId: selected!.orderLineId,
              serialNumber: serialNumber.trim(),
              assetTag: assetTag.trim() || undefined,
            }
          : {
              ownership,
              serialNumber: serialNumber.trim(),
              brand: brand.trim() || undefined,
              model: model.trim(),
            }
      )
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("assetCreated"))
      router.push(`/admin/assets/${result.id}`)
    })
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="asset-ownership">
          {t("ownershipLabel")}
        </label>
        <select
          id="asset-ownership"
          value={ownership}
          onChange={(e) => setOwnership(e.target.value as typeof ownership)}
          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        >
          <option value="kara">{t("ownership.kara")}</option>
          <option value="customer">{t("ownership.customer")}</option>
          <option value="supplier">{t("ownership.supplier")}</option>
        </select>
        {!isKara && <p className="mt-1 text-xs text-muted-foreground">{t("ownershipHint")}</p>}
      </div>

      {!isKara && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="asset-brand">
              {t("brand")}
            </label>
            <input
              id="asset-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="asset-model">
              {t("model")}
            </label>
            <input
              id="asset-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
            />
          </div>
        </div>
      )}

      <div className={isKara ? undefined : "hidden"}>
        <label className="mb-1 block text-sm font-medium">{t("selectSourceLine")}</label>
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t("selectSourceLinePlaceholder")}
          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        />
        {searching && <p className="mt-1 text-xs text-muted-foreground">{t("searching")}</p>}
        {options.length > 0 && !selected && (
          <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border">
            {options.map((o) => (
              <li key={o.orderLineId}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(o)
                    setQuery(`${o.orderNumber} · ${[o.brand, o.model, o.description].filter(Boolean).join(" ")}`)
                    setOptions([])
                  }}
                  className="w-full px-3 py-2 text-start text-sm hover:bg-accent"
                >
                  <span className="font-mono text-xs text-kara-purple" dir="ltr">{o.orderNumber}</span>{" "}
                  {[o.brand, o.model, o.description].filter(Boolean).join(" · ")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{t("serial")}</label>
        <input
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
          placeholder={t("scanSerialPlaceholder")}
          dir="ltr"
          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        />
      </div>

      <div className={isKara ? undefined : "hidden"}>
        <label className="mb-1 block text-sm font-medium">
          {t("assetTag")} <span className="text-xs text-muted-foreground">({t("optionalAutoGenerated")})</span>
        </label>
        <input
          value={assetTag}
          onChange={(e) => setAssetTag(e.target.value)}
          placeholder="KARA-00001"
          dir="ltr"
          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={pending || !canSubmit}
        className="w-full sm:w-auto"
      >
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("createAsset")}
      </Button>
    </div>
  )
}
