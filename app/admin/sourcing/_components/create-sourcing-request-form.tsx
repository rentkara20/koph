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
import { Textarea } from "@/components/ui/textarea"
import { createSourcingRequest } from "@/lib/actions/sourcing"
import { translateActionError } from "@/lib/i18n/action-errors"

type SourceType = "customer_order" | "stock_replenishment" | "operational_need"

export function CreateSourcingRequestForm() {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [sourceType, setSourceType] = useState<SourceType>("operational_need")
  const [orderId, setOrderId] = useState("")
  const [orderLineId, setOrderLineId] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await createSourcingRequest({
        sourceType,
        orderId: sourceType === "customer_order" ? orderId.trim() || undefined : undefined,
        orderLineId: sourceType === "customer_order" ? orderLineId.trim() || undefined : undefined,
        description: description.trim(),
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
      <div>
        <Label>{t("sourceType")}</Label>
        <Select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
          <option value="operational_need">{t("sourceTypes.operational_need")}</option>
          <option value="stock_replenishment">{t("sourceTypes.stock_replenishment")}</option>
          <option value="customer_order">{t("sourceTypes.customer_order")}</option>
        </Select>
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

      <div>
        <Label>{t("description")}</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={pending || !description.trim()} className="w-full sm:w-auto">
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("save")}
      </Button>
    </div>
  )
}
