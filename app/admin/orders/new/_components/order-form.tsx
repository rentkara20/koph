"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { createOrder } from "@/lib/actions/orders"
import type { Customer } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

type LineRow = {
  id: number
  description: string
  brand: string
  model: string
  quantity: number
  rentalMonths: string
  unitPriceMonthly: string
  notes: string
}

let nextLineId = 1

function emptyLine(): LineRow {
  return {
    id: nextLineId++,
    description: "",
    brand: "",
    model: "",
    quantity: 1,
    rentalMonths: "",
    unitPriceMonthly: "",
    notes: "",
  }
}

function toNum(v: string): number | undefined {
  const n = Number(v)
  return v.trim() && Number.isFinite(n) ? n : undefined
}

export function OrderForm({ customers }: { customers: Customer[] }) {
  const t = useTranslations("orders")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<LineRow[]>([emptyLine()])

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  function updateLine(id: number, field: keyof LineRow, value: string | number) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const fd = new FormData(e.currentTarget)
      const validLines = lines.filter((l) => l.description.trim())

      const result = await createOrder({
        orderNumber: (fd.get("orderNumber") as string)?.trim(),
        customerId: fd.get("customerId") as string,
        contactPerson: (fd.get("contactPerson") as string) || undefined,
        contactMobile: (fd.get("contactMobile") as string) || undefined,
        contactEmail: (fd.get("contactEmail") as string) || undefined,
        quoteDate: (fd.get("quoteDate") as string) || undefined,
        rentalPeriodMonths: toNum(fd.get("rentalPeriodMonths") as string),
        additionalPeriodMonths: toNum(fd.get("additionalPeriodMonths") as string),
        notes: (fd.get("notes") as string) || undefined,
        lines: validLines.map((l) => ({
          description: l.description,
          brand: l.brand || undefined,
          model: l.model || undefined,
          quantity: l.quantity,
          rentalMonths: toNum(l.rentalMonths),
          unitPriceMonthly: toNum(l.unitPriceMonthly),
          notes: l.notes || undefined,
        })),
      })

      if (result.error) {
        setError(translateActionError(result.error))
        setLoading(false)
        return
      }
      router.push(`/admin/orders/${result.id}`)
    } catch {
      setError("An unexpected error occurred")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order number + customer */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="orderNumber">
            {t("orderNumber")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="orderNumber"
            name="orderNumber"
            placeholder="e.g. 10669"
            className="font-mono"
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customerId">
            {t("customer")} <span className="text-destructive">*</span>
          </Label>
          <Select id="customerId" name="customerId" required>
            <option value="">— {t("customer")} —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactPerson">
            {t("contactPerson")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="contactPerson" name="contactPerson" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactMobile">
            {t("contactMobile")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="contactMobile" name="contactMobile" type="tel" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactEmail">
            {t("contactEmail")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="contactEmail" name="contactEmail" type="email" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quoteDate">
            {t("quoteDate")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="quoteDate" name="quoteDate" type="date" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rentalPeriodMonths">
            {t("rentalPeriodMonths")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="rentalPeriodMonths" name="rentalPeriodMonths" type="number" min={0} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="additionalPeriodMonths">
            {t("additionalPeriodMonths")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="additionalPeriodMonths" name="additionalPeriodMonths" type="number" min={0} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">
            {tCommon("notes")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>
      </div>

      <Separator />

      {/* Lines */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{t("lines")}</h3>
            <p className="text-xs text-muted-foreground">{t("linesHint")}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="size-3.5" />
            {t("addLine")}
          </Button>
        </div>

        {lines.map((line, idx) => (
          <div key={line.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("line")} {idx + 1}
              </span>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">
                  {t("deviceSpec")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(line.id, "description", e.target.value)}
                  placeholder="e.g. ThinkPad L14, U7-255U, 32GB, 512GB, Win 11 Pro"
                  required={idx === 0}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("brand")}</Label>
                <Input
                  value={line.brand}
                  onChange={(e) => updateLine(line.id, "brand", e.target.value)}
                  placeholder="e.g. Lenovo"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("model")}</Label>
                <Input
                  value={line.model}
                  onChange={(e) => updateLine(line.id, "model", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("quantity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.id, "quantity", parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("rentalMonths")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={line.rentalMonths}
                  onChange={(e) => updateLine(line.id, "rentalMonths", e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("unitPriceMonthly")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unitPriceMonthly}
                  onChange={(e) => updateLine(line.id, "unitPriceMonthly", e.target.value)}
                  placeholder="SAR / month"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 justify-end">
        <Link href="/admin/orders" className={cn(buttonVariants({ variant: "outline" }))}>
          {tCommon("cancel")}
        </Link>
        <Button type="submit" disabled={loading}>
          {loading ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  )
}
