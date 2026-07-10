"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createPurchaseOrder } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { Supplier } from "@/lib/db/schema"

type LineRow = {
  key: number
  itemDescription: string
  brand: string
  model: string
  requiresSerial: boolean
  qtyOrdered: string
  unitCost: string
}

let nextKey = 1
function emptyLine(): LineRow {
  return { key: nextKey++, itemDescription: "", brand: "", model: "", requiresSerial: true, qtyOrdered: "1", unitCost: "" }
}

export function CreatePoForm({ suppliers }: { suppliers: Supplier[] }) {
  const t = useTranslations("procurement")
  const router = useRouter()
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const [poNumber, setPoNumber] = useState("")
  const [invoiceRef, setInvoiceRef] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineRow[]>([emptyLine()])
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function updateLine(key: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await createPurchaseOrder({
        supplierId,
        poNumber: poNumber.trim(),
        invoiceRef: invoiceRef.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          itemDescription: l.itemDescription.trim(),
          brand: l.brand.trim() || undefined,
          model: l.model.trim() || undefined,
          requiresSerial: l.requiresSerial,
          qtyOrdered: parseInt(l.qtyOrdered, 10) || 0,
          unitCost: l.unitCost.trim() ? parseFloat(l.unitCost) : undefined,
        })),
      })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("poCreated"))
      router.push(`/admin/procurement/${result.id}`)
    })
  }

  const canSubmit =
    supplierId && poNumber.trim() && lines.every((l) => l.itemDescription.trim() && parseInt(l.qtyOrdered, 10) > 0)

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>{t("supplier")}</Label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("poNumber")}</Label>
          <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} dir="ltr" />
        </div>
        <div>
          <Label>{t("invoiceRef")}</Label>
          <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} dir="ltr" />
        </div>
      </div>

      <div>
        <Label>{t("notes")}</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="mb-0">{t("lines")}</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
            <Plus className="me-1 size-3.5" />
            {t("addLine")}
          </Button>
        </div>

        {lines.map((line) => (
          <div key={line.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label className="text-xs">{t("itemDescription")}</Label>
              <Input
                value={line.itemDescription}
                onChange={(e) => updateLine(line.key, { itemDescription: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("brand")}</Label>
              <Input value={line.brand} onChange={(e) => updateLine(line.key, { brand: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">{t("model")}</Label>
              <Input value={line.model} onChange={(e) => updateLine(line.key, { model: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">{t("qtyOrdered")}</Label>
              <Input
                type="number"
                min={1}
                value={line.qtyOrdered}
                onChange={(e) => updateLine(line.key, { qtyOrdered: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("unitCost")}</Label>
              <Input
                type="number"
                min={0}
                value={line.unitCost}
                onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-6">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={line.requiresSerial}
                  onChange={(e) => updateLine(line.key, { requiresSerial: e.target.checked })}
                />
                {t("requiresSerial")}
              </label>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}
                  className="ms-auto text-destructive hover:opacity-70"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={pending || !canSubmit} className="w-full sm:w-auto">
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("save")}
      </Button>
    </div>
  )
}
