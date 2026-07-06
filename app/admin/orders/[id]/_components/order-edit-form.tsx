"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { updateOrder } from "@/lib/actions/orders"
import type { Customer, Order, OrderLine } from "@/lib/db/schema"
import { orderStatuses } from "@/lib/utils/order-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type LineRow = {
  key: number
  dbId?: string
  description: string
  brand: string
  model: string
  quantity: number
  rentalMonths: string
  unitPriceMonthly: string
}

let nextKey = 1

function toNum(v: string): number | undefined {
  const n = Number(v)
  return v.trim() && Number.isFinite(n) ? n : undefined
}

function dateInputValue(epoch: number | null): string {
  if (!epoch) return ""
  return new Date(epoch).toISOString().slice(0, 10)
}

export function OrderEditForm({
  order,
  lines: initialLines,
  customers,
}: {
  order: Order
  lines: OrderLine[]
  customers: Customer[]
}) {
  const t = useTranslations("orders")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<LineRow[]>(
    initialLines.length > 0
      ? initialLines.map((l) => ({
          key: nextKey++,
          dbId: l.id,
          description: l.description,
          brand: l.brand ?? "",
          model: l.model ?? "",
          quantity: l.quantity,
          rentalMonths: l.rentalMonths != null ? String(l.rentalMonths) : "",
          unitPriceMonthly: l.unitPriceMonthly != null ? String(l.unitPriceMonthly) : "",
        }))
      : [{ key: nextKey++, description: "", brand: "", model: "", quantity: 1, rentalMonths: "", unitPriceMonthly: "" }]
  )

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: nextKey++, description: "", brand: "", model: "", quantity: 1, rentalMonths: "", unitPriceMonthly: "" },
    ])
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLine(key: number, field: keyof LineRow, value: string | number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const fd = new FormData(e.currentTarget)
      const validLines = lines.filter((l) => l.description.trim())

      const result = await updateOrder(order.id, {
        orderNumber: (fd.get("orderNumber") as string)?.trim(),
        customerId: fd.get("customerId") as string,
        status: fd.get("status") as (typeof orderStatuses)[number],
        contactPerson: (fd.get("contactPerson") as string) || undefined,
        contactMobile: (fd.get("contactMobile") as string) || undefined,
        contactEmail: (fd.get("contactEmail") as string) || undefined,
        quoteDate: (fd.get("quoteDate") as string) || undefined,
        rentalPeriodMonths: toNum(fd.get("rentalPeriodMonths") as string),
        additionalPeriodMonths: toNum(fd.get("additionalPeriodMonths") as string),
        notes: (fd.get("notes") as string) || undefined,
        lines: validLines.map((l) => ({
          id: l.dbId,
          description: l.description,
          brand: l.brand || undefined,
          model: l.model || undefined,
          quantity: l.quantity,
          rentalMonths: toNum(l.rentalMonths),
          unitPriceMonthly: toNum(l.unitPriceMonthly),
        })),
      })

      if (result.error) {
        setError(result.error)
        toast.error(result.error)
        setLoading(false)
        return
      }
      toast.success(tToast("updated"))
      setLoading(false)
      router.refresh()
    } catch {
      setError("An unexpected error occurred")
      toast.error(tToast("genericError"))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="orderNumber">
            {t("orderNumber")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="orderNumber"
            name="orderNumber"
            className="font-mono"
            defaultValue={order.orderNumber}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">{tCommon("status")}</Label>
          <Select id="status" name="status" defaultValue={order.status}>
            {orderStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customerId">
            {t("customer")} <span className="text-destructive">*</span>
          </Label>
          <Select id="customerId" name="customerId" defaultValue={order.customerId} required>
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
          <Input id="contactPerson" name="contactPerson" defaultValue={order.contactPerson ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactMobile">
            {t("contactMobile")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="contactMobile" name="contactMobile" type="tel" defaultValue={order.contactMobile ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactEmail">
            {t("contactEmail")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="contactEmail" name="contactEmail" type="email" defaultValue={order.contactEmail ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quoteDate">
            {t("quoteDate")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="quoteDate" name="quoteDate" type="date" defaultValue={dateInputValue(order.quoteDate)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rentalPeriodMonths">
            {t("rentalPeriodMonths")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input
            id="rentalPeriodMonths"
            name="rentalPeriodMonths"
            type="number"
            min={0}
            defaultValue={order.rentalPeriodMonths != null ? String(order.rentalPeriodMonths) : ""}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="additionalPeriodMonths">
            {t("additionalPeriodMonths")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input
            id="additionalPeriodMonths"
            name="additionalPeriodMonths"
            type="number"
            min={0}
            defaultValue={order.additionalPeriodMonths != null ? String(order.additionalPeriodMonths) : ""}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">
            {tCommon("notes")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={order.notes ?? ""} />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t("lines")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="size-3.5" />
            {t("addLine")}
          </Button>
        </div>

        {lines.map((line, idx) => (
          <div key={line.key} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("line")} {idx + 1}
              </span>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
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
                  onChange={(e) => updateLine(line.key, "description", e.target.value)}
                  required={idx === 0}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("brand")}</Label>
                <Input value={line.brand} onChange={(e) => updateLine(line.key, "brand", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("model")}</Label>
                <Input value={line.model} onChange={(e) => updateLine(line.key, "model", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("quantity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, "quantity", parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("rentalMonths")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={line.rentalMonths}
                  onChange={(e) => updateLine(line.key, "rentalMonths", e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("unitPriceMonthly")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unitPriceMonthly}
                  onChange={(e) => updateLine(line.key, "unitPriceMonthly", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 justify-end">
        <Link href="/admin/orders" className={cn(buttonVariants({ variant: "outline" }))}>
          {tCommon("back")}
        </Link>
        <Button type="submit" disabled={loading}>
          {loading ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  )
}
