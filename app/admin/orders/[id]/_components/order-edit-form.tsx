"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { updateOrder } from "@/lib/actions/orders"
import type { Customer, Order, OrderLine } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"
import { ExternalLink } from "lucide-react"

type LineRow = {
  key: number
  dbId?: string
  description: string
  quantity: number
}

let nextKey = 1

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
          quantity: l.quantity,
        }))
      : [{ key: nextKey++, description: "", quantity: 1 }]
  )

  function addLine() {
    setLines((prev) => [...prev, { key: nextKey++, description: "", quantity: 1 }])
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
        customerId: (fd.get("customerId") as string) || order.customerId,
        quoteDate: (fd.get("quoteDate") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
        lines: validLines.map((l) => ({
          id: l.dbId,
          description: l.description,
          quantity: l.quantity,
        })),
      })

      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
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
          <Label htmlFor="quoteDate">
            {t("quoteDate")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="quoteDate" name="quoteDate" type="date" defaultValue={dateInputValue(order.quoteDate)} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="customerId">
              {t("customer")} <span className="text-destructive">*</span>
            </Label>
            <Link
              href={`/admin/customers/${order.customerId}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("viewCustomerProfile")}
              <ExternalLink className="size-3" />
            </Link>
          </div>
          <Select id="customerId" name="customerId" defaultValue={order.customerId} required>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
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

            <div className="grid gap-3 sm:grid-cols-3">
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
                <Label className="text-xs">{t("quantity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, "quantity", parseInt(e.target.value) || 1)}
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
