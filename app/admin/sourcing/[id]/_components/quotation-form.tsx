"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { submitSupplierQuotation } from "@/lib/actions/quotations"
import { translateActionError } from "@/lib/i18n/action-errors"

type LineRow = { key: number; itemDescription: string; qty: string; unitPrice: string; leadTimeDays: string }

let nextKey = 1
function emptyLine(): LineRow {
  return { key: nextKey++, itemDescription: "", qty: "1", unitPrice: "", leadTimeDays: "" }
}

export function QuotationForm({ rfqId }: { rfqId: string }) {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [lines, setLines] = useState<LineRow[]>([emptyLine()])
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function updateLine(key: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await submitSupplierQuotation({
        rfqId,
        lines: lines.map((l) => ({
          itemDescription: l.itemDescription.trim(),
          qty: parseInt(l.qty, 10) || 0,
          unitPrice: l.unitPrice.trim() ? parseFloat(l.unitPrice) : undefined,
          leadTimeDays: l.leadTimeDays.trim() ? parseInt(l.leadTimeDays, 10) : undefined,
        })),
      })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("quotationSubmitted"))
      router.refresh()
    })
  }

  const canSubmit = lines.every((l) => l.itemDescription.trim() && parseInt(l.qty, 10) > 0)

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t("submitQuotation")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
          <Plus className="me-1 size-3.5" />
          {t("addLine")}
        </Button>
      </div>

      {lines.map((line) => (
        <div key={line.key} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Label className="text-xs">{t("itemDescription")}</Label>
            <Input value={line.itemDescription} onChange={(e) => updateLine(line.key, { itemDescription: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">{t("qty")}</Label>
            <Input type="number" min={1} value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">{t("unitPrice")}</Label>
            <Input type="number" min={0} value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">{t("leadTimeDays")}</Label>
              <Input type="number" min={0} value={line.leadTimeDays} onChange={(e) => updateLine(line.key, { leadTimeDays: e.target.value })} />
            </div>
            {lines.length > 1 && (
              <button type="button" onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))} className="text-destructive hover:opacity-70">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSubmit} disabled={pending || !canSubmit} size="sm">
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("submitQuotation")}
      </Button>
    </div>
  )
}
