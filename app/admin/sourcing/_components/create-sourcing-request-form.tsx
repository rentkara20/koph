"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createSourcingRequest } from "@/lib/actions/sourcing"
import { translateActionError } from "@/lib/i18n/action-errors"

type SourceType = "customer_order" | "stock_replenishment" | "operational_need"

type ItemDraft = {
  quantity: string
  customerDescription: string
  supplierDescription: string
  partNumber: string
  notes: string
}

const EMPTY_ITEM: ItemDraft = {
  quantity: "1",
  customerDescription: "",
  supplierDescription: "",
  partNumber: "",
  notes: "",
}

export function CreateSourcingRequestForm() {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [sourceType, setSourceType] = useState<SourceType>("customer_order")
  const [orderId, setOrderId] = useState("")
  const [orderLineId, setOrderLineId] = useState("")
  const [externalRef, setExternalRef] = useState("")
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }])
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const itemsValid = items.every(
    (item) =>
      item.customerDescription.trim() &&
      item.supplierDescription.trim() &&
      Number.parseInt(item.quantity, 10) >= 1
  )

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await createSourcingRequest({
        sourceType,
        orderId: sourceType === "customer_order" ? orderId.trim() || undefined : undefined,
        orderLineId: sourceType === "customer_order" ? orderLineId.trim() || undefined : undefined,
        externalRef: externalRef.trim() || undefined,
        title: title.trim(),
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          quantity: Number.parseInt(item.quantity, 10) || 1,
          customerDescription: item.customerDescription.trim(),
          supplierDescription: item.supplierDescription.trim(),
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
          <Label>{t("externalRef")}</Label>
          <Input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
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
        <Label>{t("requestTitle")}</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {sourceType === "customer_order" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("orderId")}</Label>
            <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label>{t("orderLineId")}</Label>
            <Input value={orderLineId} onChange={(e) => setOrderLineId(e.target.value)} dir="ltr" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("items")}</p>
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
            <div>
              <Label>{t("supplierDescription")}</Label>
              <Textarea
                value={item.supplierDescription}
                onChange={(e) => updateItem(index, { supplierDescription: e.target.value })}
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
        disabled={pending || !title.trim() || !itemsValid}
        className="w-full sm:w-auto"
      >
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("save")}
      </Button>
    </div>
  )
}
