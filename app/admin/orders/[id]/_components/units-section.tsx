"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
import { saveOrderUnits } from "@/lib/actions/orders"
import type { OrderLine, OrderUnit, Supplier } from "@/lib/db/schema"
import { unitStatuses } from "@/lib/utils/order-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type UnitStatus = (typeof unitStatuses)[number]

type UnitRow = {
  key: number
  dbId?: string
  orderLineId: string
  serialNumber: string
  supplierId: string
  purchaseCost: string
  status: UnitStatus
}

let nextKey = 1

function toNum(v: string): number | undefined {
  const n = Number(v)
  return v.trim() && Number.isFinite(n) ? n : undefined
}

export function UnitsSection({
  orderId,
  lines,
  units: initialUnits,
  suppliers,
}: {
  orderId: string
  lines: OrderLine[]
  units: OrderUnit[]
  suppliers: Supplier[]
}) {
  const t = useTranslations("orders")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const defaultLineId = lines[0]?.id ?? ""
  const [units, setUnits] = useState<UnitRow[]>(
    initialUnits.map((u) => ({
      key: nextKey++,
      dbId: u.id,
      orderLineId: u.orderLineId,
      serialNumber: u.serialNumber ?? "",
      supplierId: u.supplierId ?? "",
      purchaseCost: u.purchaseCost != null ? String(u.purchaseCost) : "",
      status: u.status,
    }))
  )

  function addUnit() {
    setUnits((prev) => [
      ...prev,
      {
        key: nextKey++,
        orderLineId: defaultLineId,
        serialNumber: "",
        supplierId: "",
        purchaseCost: "",
        status: "in_stock",
      },
    ])
  }

  function removeUnit(key: number) {
    setUnits((prev) => prev.filter((u) => u.key !== key))
  }

  function updateUnit(key: number, field: keyof UnitRow, value: string) {
    setUnits((prev) => prev.map((u) => (u.key === key ? { ...u, [field]: value } : u)))
  }

  async function handleSave() {
    if (lines.length === 0) {
      toast.error(t("addLineFirst"))
      return
    }
    setError("")
    setLoading(true)
    try {
      const result = await saveOrderUnits(
        orderId,
        units.map((u) => ({
          id: u.dbId,
          orderLineId: u.orderLineId,
          serialNumber: u.serialNumber || undefined,
          supplierId: u.supplierId || undefined,
          purchaseCost: toNum(u.purchaseCost),
          status: u.status,
        }))
      )
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

  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("addLineFirst")}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t("unitsHint")}</p>
        <Button type="button" variant="outline" size="sm" onClick={addUnit}>
          <Plus className="size-3.5" />
          {t("addUnit")}
        </Button>
      </div>

      {units.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {t("noUnits")}
        </div>
      ) : (
        <div className="space-y-3">
          {units.map((unit) => {
            const locked = unit.status !== "in_stock" && Boolean(unit.dbId)
            return (
              <div key={unit.key} className="rounded-lg border p-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">{t("device")}</Label>
                    <Select
                      value={unit.orderLineId}
                      onChange={(e) => updateUnit(unit.key, "orderLineId", e.target.value)}
                    >
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.description}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("serialNumber")}</Label>
                    <Input
                      className="font-mono"
                      value={unit.serialNumber}
                      onChange={(e) => updateUnit(unit.key, "serialNumber", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("supplier")}</Label>
                    <Select
                      value={unit.supplierId}
                      onChange={(e) => updateUnit(unit.key, "supplierId", e.target.value)}
                    >
                      <option value="">—</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("purchaseCost")}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={unit.purchaseCost}
                      onChange={(e) => updateUnit(unit.key, "purchaseCost", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tCommon("status")}</Label>
                    <Select
                      value={unit.status}
                      onChange={(e) => updateUnit(unit.key, "status", e.target.value)}
                    >
                      {unitStatuses.map((s) => (
                        <option key={s} value={s}>
                          {t(`unitStatus.${s}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  {locked ? (
                    <span className="text-xs text-muted-foreground">{t("unitLocked")}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeUnit(unit.key)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                      {tCommon("delete")}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={loading}>
          {loading ? tCommon("loading") : t("saveUnits")}
        </Button>
      </div>
    </div>
  )
}
