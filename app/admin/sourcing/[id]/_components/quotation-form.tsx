"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { submitSupplierQuotation } from "@/lib/actions/quotations"
import { translateActionError } from "@/lib/i18n/action-errors"

const CURRENCIES = ["SAR", "USD", "AED", "EUR"] as const

// One quotation line per item this RFQ carried — the operator transcribes the
// supplier's paper/PDF quote (Sourcing V2 is manual entry by design). Offered
// part number / spec / upgrades capture what the supplier actually sells; the
// delivered config stays the item's customer description.
export type QuotationItem = {
  id: string
  quantity: number
  supplierDescription: string
  partNumber: string | null
}

type LineDraft = {
  unitPrice: string
  currency: (typeof CURRENCIES)[number]
  taxRate: string
  leadTimeDays: string
  availability: string
  warranty: string
  offeredPartNumber: string
  offeredSpec: string
  upgradesNote: string
  upgradesCost: string
}

function emptyLine(): LineDraft {
  return {
    unitPrice: "",
    currency: "SAR",
    taxRate: "",
    leadTimeDays: "",
    availability: "",
    warranty: "",
    offeredPartNumber: "",
    offeredSpec: "",
    upgradesNote: "",
    upgradesCost: "",
  }
}

function parseOptionalFloat(v: string): number | undefined {
  return v.trim() ? parseFloat(v) : undefined
}
function parseOptionalInt(v: string): number | undefined {
  return v.trim() ? parseInt(v, 10) : undefined
}
function trimOrUndefined(v: string): string | undefined {
  return v.trim() || undefined
}

export function QuotationForm({ rfqId, items }: { rfqId: string; items: QuotationItem[] }) {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [drafts, setDrafts] = useState<LineDraft[]>(() => items.map(() => emptyLine()))
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setDrafts((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await submitSupplierQuotation({
        rfqId,
        notes: notes.trim() || undefined,
        lines: items.map((item, i) => {
          const d = drafts[i]
          return {
            sourcingRequestItemId: item.id,
            itemDescription: item.supplierDescription,
            qty: item.quantity,
            unitPrice: parseOptionalFloat(d.unitPrice),
            currency: d.currency,
            taxRate: parseOptionalFloat(d.taxRate),
            leadTimeDays: parseOptionalInt(d.leadTimeDays),
            availability: trimOrUndefined(d.availability),
            warranty: trimOrUndefined(d.warranty),
            offeredPartNumber: trimOrUndefined(d.offeredPartNumber),
            offeredSpec: trimOrUndefined(d.offeredSpec),
            upgradesNote: trimOrUndefined(d.upgradesNote),
            upgradesCost: parseOptionalFloat(d.upgradesCost),
          }
        }),
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

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">{t("submitQuotation")}</p>

      {items.map((item, index) => {
        const d = drafts[index]
        return (
          <div key={item.id} className="space-y-2 rounded-lg border p-2.5">
            <p className="text-xs font-medium">
              {item.quantity}× {item.supplierDescription}
              {item.partNumber && (
                <span className="text-muted-foreground" dir="ltr">
                  {" "}
                  · {item.partNumber}
                </span>
              )}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-xs">{t("unitPrice")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={d.unitPrice}
                  onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">{t("currency")}</Label>
                <Select
                  value={d.currency}
                  onChange={(e) =>
                    updateLine(index, { currency: e.target.value as LineDraft["currency"] })
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("taxRatePct")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={d.taxRate}
                  onChange={(e) => updateLine(index, { taxRate: e.target.value })}
                  dir="ltr"
                  placeholder="15"
                />
              </div>
              <div>
                <Label className="text-xs">{t("leadTimeDays")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={d.leadTimeDays}
                  onChange={(e) => updateLine(index, { leadTimeDays: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">{t("availability")}</Label>
                <Input
                  value={d.availability}
                  onChange={(e) => updateLine(index, { availability: e.target.value })}
                  placeholder={t("availabilityHint")}
                />
              </div>
              <div>
                <Label className="text-xs">{t("warranty")}</Label>
                <Input
                  value={d.warranty}
                  onChange={(e) => updateLine(index, { warranty: e.target.value })}
                  placeholder={t("warrantyHint")}
                />
              </div>
              <div>
                <Label className="text-xs">{t("offeredPartNumber")}</Label>
                <Input
                  value={d.offeredPartNumber}
                  onChange={(e) => updateLine(index, { offeredPartNumber: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">{t("offeredSpec")}</Label>
                <Input
                  value={d.offeredSpec}
                  onChange={(e) => updateLine(index, { offeredSpec: e.target.value })}
                  placeholder={t("offeredSpecHint")}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">{t("upgradesNote")}</Label>
                <Input
                  value={d.upgradesNote}
                  onChange={(e) => updateLine(index, { upgradesNote: e.target.value })}
                  placeholder={t("upgradesNoteHint")}
                />
              </div>
              <div>
                <Label className="text-xs">{t("upgradesCost")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={d.upgradesCost}
                  onChange={(e) => updateLine(index, { upgradesCost: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>
          </div>
        )
      })}

      <div>
        <Label className="text-xs">{t("quotationNotes")}</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSubmit} disabled={pending || items.length === 0} size="sm">
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("submitQuotation")}
      </Button>
    </div>
  )
}
