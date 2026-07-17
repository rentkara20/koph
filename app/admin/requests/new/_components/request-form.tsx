"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { CheckCircle2, ChevronDown, Plus, Trash2, PackageSearch } from "lucide-react"
import { createRequest, getCustomerDeliveryOptions } from "@/lib/actions/requests"
import { getOrderUnitsByNumber, type OrderLookup } from "@/lib/actions/orders"
import type { RequestType, Customer } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { buildRequestItemsFromOrderUnits } from "@/lib/domain/request-import"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"
import { InlineCreateParty } from "@/components/inline-create-party"
import { addAndSelectOption } from "@/lib/domain/inline-option"
import { resolveRequestTypeSlug } from "@/lib/domain/request-form-defaults"
import { contactsForCustomerLocation } from "@/lib/domain/customer-location"
import { TimeWindowPicker } from "@/components/time-window-picker"

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
  initialOrderNumber,
  initialTypeSlug,
}: {
  requestTypes: RequestType[]
  customers: Customer[]
  initialOrderNumber?: string
  initialTypeSlug?: string
}) {
  const resolvedTypeSlug = resolveRequestTypeSlug({ initialOrderNumber, initialTypeSlug })
  // An explicit type always wins. An order-linked request defaults to delivery,
  // which keeps older links that only contain ?orderNumber=… guided as well.
  const initialTypeId =
    requestTypes.find((rt) => rt.slug === resolvedTypeSlug)?.id ?? ""
  const t = useTranslations("requests")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  // Controlled so importing an order can pre-fill them.
  const [customerId, setCustomerId] = useState("")
  const [customerOptions, setCustomerOptions] = useState(
    customers.map(({ id, name }) => ({ id, name }))
  )
  const [quoteNumber, setQuoteNumber] = useState("")
  const [deliveryOptions, setDeliveryOptions] = useState<Awaited<ReturnType<typeof getCustomerDeliveryOptions>>>({
    locations: [],
    contacts: [],
    links: [],
  })
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false)
  const [customerLocationId, setCustomerLocationId] = useState("")
  const [receiverContactId, setReceiverContactId] = useState("")
  const [timeWindow, setTimeWindow] = useState("")
  const [showAllContacts, setShowAllContacts] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCustomerLocationId("")
    setReceiverContactId("")
    setShowAllContacts(false)
    if (!customerId) {
      setDeliveryOptions({ locations: [], contacts: [], links: [] })
      return () => { cancelled = true }
    }

    setDeliveryOptionsLoading(true)
    getCustomerDeliveryOptions(customerId)
      .then((options) => {
        if (cancelled) return
        setDeliveryOptions(options)
        const defaultLocation = options.locations.find((location) => location.isDefault)
        if (defaultLocation) setCustomerLocationId(defaultLocation.id)
      })
      .finally(() => {
        if (!cancelled) setDeliveryOptionsLoading(false)
      })
    return () => { cancelled = true }
  }, [customerId])

  const linkedContacts = contactsForCustomerLocation(
    deliveryOptions.contacts,
    deliveryOptions.links,
    customerLocationId || null
  )
  const receiverOptions = showAllContacts || !customerLocationId || linkedContacts.length === 0
    ? deliveryOptions.contacts
    : linkedContacts

  // Import-from-order state
  const [orderNumberInput, setOrderNumberInput] = useState(initialOrderNumber ?? "")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState("")
  const [lookup, setLookup] = useState<OrderLookup | null>(null)
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set())
  const [autoImported, setAutoImported] = useState(false)

  async function handleLookup(overrideNumber?: string) {
    const num = (overrideNumber ?? orderNumberInput).trim()
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
      const autoImport = Boolean(initialOrderNumber?.trim() && resolvedTypeSlug === "delivery")
      if (autoImport && res.order.units.length > 0) {
        const imported = buildRequestItemsFromOrderUnits(res.order.units).map((item) => ({
          id: nextItemId++,
          ...item,
        }))
        setItems(imported)
        setLookup({ ...res.order, units: [] })
        setSelectedUnits(new Set())
        setAutoImported(true)
      } else {
        setLookup(res.order)
        setSelectedUnits(new Set(res.order.units.map((u) => u.unitId)))
        setAutoImported(false)
      }
      // Order number IS the quote number; pre-fill customer + quote for traceability.
      if (!customerId) setCustomerId(res.order.customerId)
      if (!quoteNumber.trim()) setQuoteNumber(res.order.orderNumber)
    } catch {
      setLookupError(t("orderNotFound"))
    } finally {
      setLookupLoading(false)
    }
  }

  // Coming from an order's "create delivery request" button — fetch immediately.
  useEffect(() => {
    if (initialOrderNumber?.trim()) {
      handleLookup(initialOrderNumber)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

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
        customerLocationId: customerLocationId || undefined,
        receiverContactId: receiverContactId || undefined,
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
        setError(translateActionError(result.error))
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
      {/* A guided order flow gets a compact confirmation; manual requests keep the picker. */}
      {autoImported && lookup ? (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">{t("orderImported", { orderNumber: lookup.orderNumber })}</p>
            <p className="text-sm text-green-800">
              {t("unitsAddedAutomatically", { count: items.filter((item) => item.orderUnitId).length })}
            </p>
          </div>
        </div>
      ) : (
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
          <Button type="button" variant="outline" onClick={() => handleLookup()} disabled={lookupLoading}>
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
              {!autoImported && (
                <span className="text-xs text-muted-foreground">
                  {lookup.units.length} {t("availableUnits")}
                </span>
              )}
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
      )}

      {/* Only the fields needed for the everyday flow stay open. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="typeId">
            {t("type")} <span className="text-destructive">*</span>
          </Label>
          <Select id="typeId" name="typeId" required defaultValue={initialTypeId}>
            <option value="">— {t("chooseType")} —</option>
            {requestTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {locale === "ar" ? rt.nameAr : rt.nameEn}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customerId">
            {t("customer")} <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-2">
            <Select
              id="customerId"
              name="customerId"
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="flex-1"
            >
              <option value="">— {t("chooseCustomer")} —</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <InlineCreateParty
              kind="customer"
              onCreated={(created) => {
                const next = addAndSelectOption(customerOptions, created)
                setCustomerOptions(next.options)
                setCustomerId(next.selectedId)
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customerLocationId">{t("customerLocation")}</Label>
          <Select
            id="customerLocationId"
            value={customerLocationId}
            onChange={(event) => {
              setCustomerLocationId(event.target.value)
              setReceiverContactId("")
              setShowAllContacts(false)
            }}
            disabled={!customerId || deliveryOptionsLoading}
          >
            <option value="">— {deliveryOptionsLoading ? tCommon("loading") : t("chooseCustomerLocation")} —</option>
            {deliveryOptions.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}{location.city ? ` · ${location.city}` : ""}
              </option>
            ))}
          </Select>
          {customerId && !deliveryOptionsLoading && deliveryOptions.locations.length === 0 && (
            <Link href={`/admin/customers/${customerId}`} className="inline-flex min-h-10 items-center text-xs font-medium text-primary hover:underline">
              {t("addCustomerLocationFirst")}
            </Link>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="receiverContactId">{t("receiver")}</Label>
          <Select
            id="receiverContactId"
            value={receiverContactId}
            onChange={(event) => setReceiverContactId(event.target.value)}
            disabled={!customerId || deliveryOptionsLoading}
          >
            <option value="">— {t("chooseReceiverOptional")} —</option>
            {receiverOptions.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}{contact.role ? ` · ${contact.role}` : ""}
              </option>
            ))}
          </Select>
          {customerLocationId && linkedContacts.length < deliveryOptions.contacts.length && (
            <button
              type="button"
              className="min-h-10 text-start text-xs font-medium text-primary hover:underline"
              onClick={() => setShowAllContacts((current) => !current)}
            >
              {showAllContacts ? t("showLocationContacts") : t("showAllCustomerContacts")}
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deliveryDate">
            {t("deliveryDate")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="deliveryDate" name="deliveryDate" type="date" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timeWindow">
            {t("timeWindow")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <TimeWindowPicker value={timeWindow} onChange={setTimeWindow} name="timeWindow" idPrefix="new-request-window" />
        </div>

      </div>

      <details className="group rounded-xl border bg-muted/20">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-medium">{t("additionalDetails")}</span>
            <span className="block text-xs text-muted-foreground">{t("additionalDetailsHint")}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quoteNumber">{t("quoteNumber")}</Label>
            <Input
              id="quoteNumber"
              name="quoteNumber"
              value={quoteNumber}
              onChange={(e) => setQuoteNumber(e.target.value)}
              placeholder="e.g. 10669"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collectionDate">{t("collectionDate")}</Label>
            <Input id="collectionDate" name="collectionDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salesRef">{t("salesRef")}</Label>
            <Input id="salesRef" name="salesRef" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="poNumber">{t("poNumber")}</Label>
            <Input id="poNumber" name="poNumber" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{tCommon("notes")}</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex min-h-11 cursor-pointer select-none items-center gap-2.5">
              <input type="checkbox" name="requireNationalId" className="h-4 w-4 rounded border-input" />
              <span className="text-sm">{t("requireNationalId")}</span>
            </label>
          </div>
        </div>
      </details>

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
                {t("itemNumber", { number: idx + 1 })}
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
                  aria-label={t("removeItem", { number: idx + 1 })}
                  className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">
                  {t("description")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(item.id, "description", e.target.value)}
                  placeholder="e.g. Laptop, Router, Camera"
                  required={idx === 0}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("serialNumber")}</Label>
                <Input
                  value={item.serialNumber}
                  onChange={(e) => updateItem(item.id, "serialNumber", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("quantity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                />
              </div>
              <details className="group sm:col-span-2">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
                  {t("itemDetails")}
                </summary>
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("brand")}</Label>
                    <Input
                      value={item.brand}
                      onChange={(e) => updateItem(item.id, "brand", e.target.value)}
                      placeholder="e.g. Dell, Cisco"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("model")}</Label>
                    <Input
                      value={item.model}
                      onChange={(e) => updateItem(item.id, "model", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">{t("accessories")}</Label>
                    <Input
                      value={item.accessories}
                      onChange={(e) => updateItem(item.id, "accessories", e.target.value)}
                      placeholder="e.g. charger, case"
                    />
                  </div>
                </div>
              </details>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-dashed"
          onClick={addItem}
        >
          <Plus className="size-4" />
          {t("addAnotherItem")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/admin/requests" className={cn(buttonVariants({ variant: "outline" }))}>
          {tCommon("cancel")}
        </Link>
        <Button type="submit" disabled={loading} className="h-11 sm:min-w-32">
          {loading ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  )
}
