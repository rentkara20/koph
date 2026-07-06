"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, ChevronUp } from "lucide-react"
import { addContract, updateContractStatus } from "@/lib/actions/partners"
import type { RequestType } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils/format"
import { translateActionError } from "@/lib/i18n/action-errors"

type ContractRow = {
  id: string
  name: string
  pricingModel: string
  unitPrice: number
  status: string
  startDate: number | null
  endDate: number | null
  serviceTypeId: string | null
  serviceTypeName: string | null
  createdAt: number
}

const PRICING_MODELS = ["per_order", "per_item", "per_day", "per_hour", "fixed"] as const
const CONTRACT_STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  active: "success",
  expired: "secondary",
  cancelled: "destructive",
}

export function ContractsSection({
  partnerId,
  contracts,
  requestTypes,
}: {
  partnerId: string
  contracts: ContractRow[]
  requestTypes: RequestType[]
}) {
  const t = useTranslations("partners")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      const result = await addContract(partnerId, new FormData(e.currentTarget))
      if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); setLoading(false); return }
      toast.success(tToast("created"))
      setShowForm(false); router.refresh()
    } catch {
      setError("An unexpected error occurred")
      toast.error(tToast("genericError"))
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(contractId: string, status: "active" | "expired" | "cancelled") {
    try {
      const result = await updateContractStatus(contractId, partnerId, status)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("updated"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  return (
    <div>
      {/* Contract list */}
      {contracts.length === 0 && !showForm ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{tCommon("noResults")}</p>
      ) : (
        <ul className="divide-y">
          {contracts.map((c) => (
            <li key={c.id} className="px-4 py-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{c.name}</p>
                  {c.serviceTypeName && (
                    <p className="text-xs text-muted-foreground">{c.serviceTypeName}</p>
                  )}
                </div>
                <Badge variant={CONTRACT_STATUS_VARIANT[c.status] ?? "secondary"} className="shrink-0">
                  {c.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{t(`pricingModels.${c.pricingModel}`)}</span>
                <span>·</span>
                <span className="font-medium text-foreground">SAR {c.unitPrice.toLocaleString()}</span>
              </div>
              {(c.startDate || c.endDate) && (
                <p className="text-xs text-muted-foreground">
                  {formatDate(c.startDate)} – {formatDate(c.endDate)}
                </p>
              )}
              {c.status === "active" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleStatusChange(c.id, "expired")}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Mark expired
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    onClick={() => handleStatusChange(c.id, "cancelled")}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add contract form toggle */}
      <div className="p-4 border-t">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {showForm ? <ChevronUp className="size-3.5" /> : <Plus className="size-3.5" />}
          {t("addContract")}
        </button>

        {showForm && (
          <form onSubmit={handleAdd} className="mt-4 space-y-3">
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">Contract name <span className="text-destructive">*</span></Label>
              <Input name="name" placeholder="e.g. Delivery SAR 150/order" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Service type <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
              <Select name="serviceTypeId">
                <option value="">— Any —</option>
                {requestTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>{rt.nameEn}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pricing model</Label>
                <Select name="pricingModel" defaultValue="per_order">
                  {PRICING_MODELS.map((m) => (
                    <option key={m} value={m}>{t(`pricingModels.${m}`)}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit price (SAR) <span className="text-destructive">*</span></Label>
                <Input name="unitPrice" type="number" min="0" step="0.01" placeholder="0.00" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start date <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Input name="startDate" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End date <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Input name="endDate" type="date" />
              </div>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? tCommon("loading") : tCommon("save")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
