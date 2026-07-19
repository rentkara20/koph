"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select"
import { Textarea } from "@/components/ui/textarea"
import { createSourcingRequest } from "@/lib/actions/sourcing"
import { searchCustomers, type CustomerOption } from "@/lib/actions/customers"
import {
  searchCustomerOrders,
  getOrderByNumber,
  getOrderLineDraftsForSourcing,
  type CustomerOrderOption,
  type SourcingItemDraft,
} from "@/lib/actions/orders"
import { translateActionError } from "@/lib/i18n/action-errors"
import { resolveSupplierDescription, applySameAsToggle } from "@/lib/domain/sourcing-description"

type SourceType = "customer_order" | "stock_replenishment" | "operational_need"

type ItemDraft = {
  quantity: string
  customerDescription: string
  supplierDescription: string
  // When true, supplierDescription mirrors customerDescription and is read-only.
  // Derived in the UI — no persisted "same as" flag (see sourcing-description.ts).
  sameAsCustomer: boolean
  partNumber: string
  notes: string
}

const EMPTY_ITEM: ItemDraft = {
  quantity: "1",
  customerDescription: "",
  supplierDescription: "",
  sameAsCustomer: true,
  partNumber: "",
  notes: "",
}

// Order-line prefill → editable item row. Supplier spec starts mirrored so the
// user only edits it when a line's RFQ wording must differ from the customer's.
function draftToItem(draft: SourcingItemDraft): ItemDraft {
  return {
    ...EMPTY_ITEM,
    quantity: String(draft.quantity || 1),
    customerDescription: draft.customerDescription,
    partNumber: draft.partNumber,
    notes: draft.notes,
  }
}

type Props = {
  /** Seed shown when the customer picker first opens (not a hard limit). */
  initialCustomers: CustomerOption[]
  /** Preselected customer + order when arriving via ?orderId=… (else null). */
  initialCustomer: CustomerOption | null
  initialOrder: CustomerOrderOption | null
  /** Item rows prefilled from the preselected order's lines (else empty). */
  initialItems: SourcingItemDraft[]
}

const toOption = (o: { id: string; name?: string; orderNumber?: string }): SearchableSelectOption => ({
  value: o.id,
  label: o.name ?? o.orderNumber ?? o.id,
})

export function CreateSourcingRequestForm({
  initialCustomers,
  initialCustomer,
  initialOrder,
  initialItems,
}: Props) {
  const t = useTranslations("sourcing")
  const tCommon = useTranslations("common")
  const router = useRouter()

  const [sourceType, setSourceType] = useState<SourceType>("customer_order")
  // Track id + label together so the trigger can render a preselected record's
  // name even when it falls outside the current search page.
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? "")
  const [customerLabel, setCustomerLabel] = useState(initialCustomer?.name ?? "")
  const [orderId, setOrderId] = useState(initialOrder?.id ?? "")
  const [orderLabel, setOrderLabel] = useState(initialOrder?.orderNumber ?? "")
  // When sourcing starts from a customer order, that order number is the
  // natural request reference. Keep it editable for exceptional external refs.
  const [externalRef, setExternalRef] = useState(initialOrder?.orderNumber ?? "")
  // Optional free-text search label. Left blank, the server derives a display
  // label from the request's own data — the user is never forced to type one.
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<ItemDraft[]>(
    initialItems.length ? initialItems.map(draftToItem) : [{ ...EMPTY_ITEM }]
  )
  const [loadingItems, setLoadingItems] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const seedCustomerOptions = initialCustomers.map(toOption)

  // Server-side searches. Customer search is global; order search is always
  // scoped to the selected customer so foreign orders can never surface.
  const loadCustomers = useCallback(
    async (query: string) => (await searchCustomers(query)).map(toOption),
    []
  )
  const loadCustomerOrders = useCallback(
    async (query: string) =>
      customerId ? (await searchCustomerOrders(customerId, query)).map(toOption) : [],
    [customerId]
  )

  function handleCustomerChange(nextId: string, option: SearchableSelectOption) {
    setCustomerId(nextId)
    setCustomerLabel(option.label)
    // The previously selected order belongs to the old customer — drop it.
    setOrderId("")
    setOrderLabel("")
  }

  // Pull the order's lines into the item rows so the user does not retype what
  // the customer order already captured. Rows stay fully editable.
  function prefillItemsFromOrder(nextId: string) {
    setLoadingItems(true)
    startTransition(async () => {
      try {
        const drafts = await getOrderLineDraftsForSourcing(nextId)
        if (drafts.length) {
          setItems(drafts.map(draftToItem))
          toast.success(t("itemsPrefilled", { count: drafts.length }))
        }
      } finally {
        setLoadingItems(false)
      }
    })
  }

  function handleOrderChange(nextId: string, option: SearchableSelectOption) {
    setOrderId(nextId)
    setOrderLabel(option.label)
    setExternalRef(option.label)
    prefillItemsFromOrder(nextId)
  }

  // Resolve the whole customer+order pair from the reference number the user
  // typed, then prefill items — no need to pick customer and order by hand.
  function handleRefLookup() {
    const ref = externalRef.trim()
    if (!isCustomerOrder || !ref || ref === orderLabel || lookingUp) return
    setLookingUp(true)
    startTransition(async () => {
      try {
        const match = await getOrderByNumber(ref)
        if (!match) {
          toast.info(t("orderNumberNotFound", { orderNumber: ref }))
          return
        }
        setCustomerId(match.customerId)
        setCustomerLabel(match.customerName)
        setOrderId(match.id)
        setOrderLabel(match.orderNumber)
        setExternalRef(match.orderNumber)
        prefillItemsFromOrder(match.id)
      } finally {
        setLookingUp(false)
      }
    })
  }

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function toggleSameAsCustomer(index: number, sameAsCustomer: boolean) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? applySameAsToggle(item, sameAsCustomer) : item))
    )
  }

  const isCustomerOrder = sourceType === "customer_order"

  // The supplier spec actually submitted for an item: the customer spec when
  // mirroring, otherwise the independently-typed value. Single source of truth
  // for validation, rendering, and submit.
  function effectiveSupplier(item: ItemDraft): string {
    return resolveSupplierDescription(
      item.sameAsCustomer,
      item.customerDescription,
      item.supplierDescription
    )
  }

  const itemsValid = items.every(
    (item) =>
      item.customerDescription.trim() &&
      effectiveSupplier(item).trim() &&
      Number.parseInt(item.quantity, 10) >= 1
  )

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await createSourcingRequest({
        sourceType,
        orderId: isCustomerOrder ? orderId || undefined : undefined,
        externalRef: externalRef.trim() || undefined,
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          quantity: Number.parseInt(item.quantity, 10) || 1,
          customerDescription: item.customerDescription.trim(),
          supplierDescription: effectiveSupplier(item).trim(),
          partNumber: item.partNumber.trim() || undefined,
          notes: item.notes.trim() || undefined,
        })),
      })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("requestCreated"))
      router.push(`/admin/sourcing/${result.id}`)
    })
  }

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="flex items-center gap-2">
            {t("externalRef")}
            {lookingUp && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </Label>
          <Input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleRefLookup()
              }
            }}
            onBlur={handleRefLookup}
            dir="ltr"
            placeholder={t("externalRefPlaceholder")}
          />
        </div>
        <div>
          <Label>{t("sourceType")}</Label>
          <Select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
            <option value="customer_order">{t("sourceTypes.customer_order")}</option>
            <option value="stock_replenishment">{t("sourceTypes.stock_replenishment")}</option>
            <option value="operational_need">{t("sourceTypes.operational_need")}</option>
          </Select>
        </div>
      </div>

      <div>
        <Label>
          {t("requestTitle")}{" "}
          <span className="text-xs font-normal text-muted-foreground">({tCommon("optional")})</span>
        </Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {isCustomerOrder && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("customer")}</Label>
            <SearchableSelect
              options={seedCustomerOptions}
              loadOptions={loadCustomers}
              value={customerId}
              selectedOption={
                customerId ? { value: customerId, label: customerLabel } : undefined
              }
              onChange={handleCustomerChange}
              placeholder={t("selectCustomer")}
              searchPlaceholder={t("searchCustomer")}
              emptyLabel={t("noCustomers")}
              loadingLabel={tCommon("loading")}
              errorLabel={t("searchError")}
            />
          </div>
          {/*
            Selecting an order prefills the item rows from its lines (see
            handleOrderChange). Not yet wired: per-line `orderLineId` linkage on
            each sourcing item — the FK exists on sourcing_request but item-level
            mapping (which order line a given RFQ item traces back to) is deferred.
          */}
          <div>
            <Label>{t("customerOrder")}</Label>
            <SearchableSelect
              // Remount on customer change to reset the picker's internal search
              // state; loadOptions is already customer-scoped.
              key={customerId || "no-customer"}
              loadOptions={loadCustomerOrders}
              value={orderId}
              selectedOption={orderId ? { value: orderId, label: orderLabel } : undefined}
              onChange={handleOrderChange}
              disabled={!customerId}
              placeholder={customerId ? t("selectOrder") : t("selectCustomerFirst")}
              searchPlaceholder={t("searchOrder")}
              emptyLabel={t("noCustomerOrders")}
              loadingLabel={tCommon("loading")}
              errorLabel={t("searchError")}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          {t("items")}
          {loadingItems && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </p>
        {items.map((item, index) => (
          <div key={index} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {t("itemN", { n: index + 1 })}
              </p>
              {items.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label>{t("qty")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="sm:col-span-3">
                <Label>{t("partNumber")}</Label>
                <Input
                  value={item.partNumber}
                  onChange={(e) => updateItem(index, { partNumber: e.target.value })}
                  dir="ltr"
                  placeholder={t("partNumberOptional")}
                />
              </div>
            </div>
            <div>
              <Label>{t("customerDescription")}</Label>
              <Textarea
                value={item.customerDescription}
                onChange={(e) => updateItem(index, { customerDescription: e.target.value })}
                rows={2}
                placeholder={t("customerDescriptionHint")}
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={item.sameAsCustomer}
                onChange={(e) => toggleSameAsCustomer(index, e.target.checked)}
              />
              <span className="text-sm">{t("sameAsCustomer")}</span>
            </label>
            <div>
              <Label>{t("supplierDescription")}</Label>
              <Textarea
                value={effectiveSupplier(item)}
                onChange={(e) => updateItem(index, { supplierDescription: e.target.value })}
                readOnly={item.sameAsCustomer}
                disabled={item.sameAsCustomer}
                rows={2}
                placeholder={t("supplierDescriptionHint")}
              />
            </div>
            <div>
              <Label>{t("itemNotes")}</Label>
              <Input value={item.notes} onChange={(e) => updateItem(index, { notes: e.target.value })} />
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}>
          <Plus className="me-1.5 size-4" />
          {t("addItem")}
        </Button>
      </div>

      <div>
        <Label>{t("requestNotes")}</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={pending || !itemsValid}
        className="w-full sm:w-auto"
      >
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("save")}
      </Button>
    </div>
  )
}
