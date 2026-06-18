"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { createRequest } from "@/lib/actions/requests"
import type { RequestType, Customer } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ItemRow = {
  id: number
  description: string
  brand: string
  model: string
  serialNumber: string
  quantity: number
  accessories: string
  notes: string
}

let nextItemId = 1

function emptyItem(): ItemRow {
  return {
    id: nextItemId++,
    description: "",
    brand: "",
    model: "",
    serialNumber: "",
    quantity: 1,
    accessories: "",
    notes: "",
  }
}

export function RequestForm({
  requestTypes,
  customers,
}: {
  requestTypes: RequestType[]
  customers: Customer[]
}) {
  const t = useTranslations("requests")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  function updateItem(id: number, field: keyof ItemRow, value: string | number) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const fd = new FormData(e.currentTarget)

      // Validate items — at least one with description
      const validItems = items.filter((i) => i.description.trim())

      const result = await createRequest({
        typeId: fd.get("typeId") as string,
        customerId: fd.get("customerId") as string,
        quoteNumber: fd.get("quoteNumber") as string,
        salesRef: (fd.get("salesRef") as string) || undefined,
        poNumber: (fd.get("poNumber") as string) || undefined,
        deliveryDate: (fd.get("deliveryDate") as string) || undefined,
        collectionDate: (fd.get("collectionDate") as string) || undefined,
        timeWindow: (fd.get("timeWindow") as string) || undefined,
        requireNationalId: fd.get("requireNationalId") === "on",
        notes: (fd.get("notes") as string) || undefined,
        items: validItems.map((i) => ({
          description: i.description,
          brand: i.brand || undefined,
          model: i.model || undefined,
          serialNumber: i.serialNumber || undefined,
          quantity: i.quantity,
          accessories: i.accessories || undefined,
          notes: i.notes || undefined,
        })),
      })

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }
      router.push(`/admin/requests/${result.id}`)
    } catch {
      setError("An unexpected error occurred")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Quote number — from sales team, optional */}
      <div className="space-y-1.5">
        <Label htmlFor="quoteNumber">
          {t("quoteNumber")}{" "}
          <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
        </Label>
        <Input
          id="quoteNumber"
          name="quoteNumber"
          placeholder="e.g. QT-2026-001"
          className="font-mono"
          autoFocus
        />
      </div>

      {/* Request info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="typeId">
            {t("type")} <span className="text-destructive">*</span>
          </Label>
          <Select id="typeId" name="typeId" required>
            <option value="">— Select type —</option>
            {requestTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.nameEn}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customerId">
            {t("customer")} <span className="text-destructive">*</span>
          </Label>
          <Select id="customerId" name="customerId" required>
            <option value="">— Select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deliveryDate">
            {t("deliveryDate")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="deliveryDate" name="deliveryDate" type="date" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="collectionDate">
            {t("collectionDate")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="collectionDate" name="collectionDate" type="date" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timeWindow">
            {t("timeWindow")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="timeWindow" name="timeWindow" placeholder="e.g. 9:00 AM – 1:00 PM" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="salesRef">
            {t("salesRef")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="salesRef" name="salesRef" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="poNumber">
            {t("poNumber")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="poNumber" name="poNumber" />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">
            {tCommon("notes")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              name="requireNationalId"
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">{t("requireNationalId")}</span>
          </label>
        </div>
      </div>

      <Separator />

      {/* Items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t("items")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="size-3.5" />
            {t("addItem")}
          </Button>
        </div>

        {items.map((item, idx) => (
          <div key={item.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Item {idx + 1}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(item.id, "description", e.target.value)}
                  placeholder="e.g. Laptop, Router, Camera"
                  required={idx === 0}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Brand</Label>
                <Input
                  value={item.brand}
                  onChange={(e) => updateItem(item.id, "brand", e.target.value)}
                  placeholder="e.g. Dell, Cisco"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Model</Label>
                <Input
                  value={item.model}
                  onChange={(e) => updateItem(item.id, "model", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serial number</Label>
                <Input
                  value={item.serialNumber}
                  onChange={(e) => updateItem(item.id, "serialNumber", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Accessories</Label>
                <Input
                  value={item.accessories}
                  onChange={(e) => updateItem(item.id, "accessories", e.target.value)}
                  placeholder="e.g. charger, case"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 justify-end">
        <Link href="/admin/requests" className={cn(buttonVariants({ variant: "outline" }))}>
          {tCommon("cancel")}
        </Link>
        <Button type="submit" disabled={loading}>
          {loading ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  )
}
