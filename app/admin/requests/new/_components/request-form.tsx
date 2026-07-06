"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Plus, Trash2, PackageSearch } from "lucide-react"
import { createRequest } from "@/lib/actions/requests"
import { getOrderUnitsByNumber, type OrderLookup } from "@/lib/actions/orders"
import type { RequestType, Customer } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
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
  orderUnitId?: string
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

  // Controlled so importing an order can pre-fill them.
  const [customerId, setCustomerId] = useState("")
  const [quoteNumber, setQuoteNumber] = useState("")

  // Import-from-order state
  const [orderNumberInput, setOrderNumberInput] = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState("")
  const [lookup, setLookup] = useState<OrderLookup | null>(null)
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set())

  async function handleLookup() {
    const num = orderNumberInput.trim()
    if (!num) return
    setLookupError("")
    setLookupLoading(true)
    try {
      const res = await getOrderUnitsByNumber(num)
      if (res.error || !res.order) {
        setLookup(null)
        setLookupError(res.error ?? t("orderNotFound"))
        setLookupLoading(false)
        return
      }
      setLookup(res.order)
      setSelectedUnits(new Set(res.order.units.map((u) => u.unitId)))
      // Order number IS the quote number; pre-fill customer + quote for traceability.
      if (!customerId) setCustomerId(res.order.customerId)
      if (!quoteNumber.trim()) setQuoteNumber(res.order.orderNumber)
    } catch {
      setLookupError(t("orderNotFound"))
    } finally {
      setLookupLoading(false)
    }
  }

  function toggleUnit(unitId: string) {
    setSelectedUnits((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  function addSelectedUnits() {
    if (!lookup) return
    const chosen = lookup.units.filter((u) => selectedUnits.has(u.unitId))
    if (chosen.length === 0) return
    const newItems: ItemRow[] = chosen.map((u) => ({
      id: nextItemId++,
      description: u.description,
      brand: u.brand ?? "",
      model: u.model ?? "",
      serialNumber: u.serialNumber ?? "",
      quantity: 1,
      accessories: "",
      notes: "",
      orderUnitId: u.unitId,
    }))
    // Drop the initial blank row when present, then append imported units.
    setItems((prev) => {
      const kept = prev.filter((i) => i.description.trim() || i.orderUnitId)
      return [...kept, ...newItems]
    })
    // Remove consumed units from the picker so they cannot be added twice.
    const remaining = lookup.units.filter((u) => !selectedUnits.has(u.unitId))
    setLookup({ ...lookup, units: remaining })
    setSelectedUnits(new Set(remaining.map((u) => u.unitId)))
  }

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
        customerId: customerId,
        quoteNumber: quoteNumber,
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
          orderUnitId: i.orderUnitId,
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
      {/* Import from order — pull device units by order number */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PackageSearch className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{t("importFromOrder")}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{t("importHint")}</p>
        <div className="flex gap-2">
          <Input
            value={orderNumberInput}
            onChange={(e) => setOrderNumberInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleLookup()
              }
            }}
            placeholder="e.g. 10669"
            className="font-mono max-w-xs"
          />
          <Button type="button" variant="outline" onClick={handleLookup} disabled={lookupLoading}>
            {lookupLoading ? tCommon("loading") : t("fetchOrder")}
          </Button>
        </div>

        {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}

        {lookup && (
          <div className="space-y-3 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t("orderCustomer")}:{" "}
                <span className="font-medium text-foreground">{lookup.customerName ?? "—"}</span>
              </p>
              <span className="text-xs text-muted-foreground">
                {lookup.units.length} {t("availableUnits")}
              </span>
            </div>

            {lookup.units.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noAvailableUnits")}</p>
            ) : (
              <>
                <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                  {lookup.units.map((u) => (
                    <li key={u.unitId}>
                      <label className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-input"
                          checked={selectedUnits.has(u.unitId)}
                          onChange={() => toggleUnit(u.unitId)}
                        />
                        <span className="text-sm">
                          <span className="font-medium">{u.description}</span>
                          {u.serialNumber && (
                            <span className="ms-2 font-mono text-xs text-muted-foreground">
                              S/N {u.serialNumber}
                            </span>
                          )}
                          {u.supplierName && (
                            <span className="ms-2 text-xs text-muted-foreground">· {u.supplierName}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  onClick={addSelectedUnits}
                  disabled={selectedUnits.size === 0}
                >
                  <Plus className="size-3.5" />
                  {t("addSelected")} ({selectedUnits.size})
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quote number — from sales team, optional */}
      <div className="space-y-1.5">
        <Label htmlFor="quoteNumber">
          {t("quoteNumber")}{" "}
          <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
        </Label>
        <Input
          id="quoteNumber"
          name="quoteNumber"
          value={quoteNumber}
          onChange={(e) => setQuoteNumber(e.target.value)}
          placeholder="e.g. 10669"
          className="font-mono"
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
          <Select
            id="customerId"
            name="customerId"
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
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
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                Item {idx + 1}
                {item.orderUnitId && (
                  <Badge variant="info" className="text-[10px]">
                    {t("fromOrder")}
                  </Badge>
                )}
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
