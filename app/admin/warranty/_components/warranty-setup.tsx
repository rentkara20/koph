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
import { createWarrantyProduct, createWarrantyBatch } from "@/lib/actions/warranty"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { WarrantyProduct } from "@/lib/db/schema"

type PoOption = { id: string; poNumber: string }

export function WarrantySetup({ products, purchaseOrders }: { products: WarrantyProduct[]; purchaseOrders: PoOption[] }) {
  const t = useTranslations("warranty")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [nameEn, setNameEn] = useState("")
  const [nameAr, setNameAr] = useState("")
  const [duration, setDuration] = useState("12")

  const [productId, setProductId] = useState(products[0]?.id ?? "")
  const [source, setSource] = useState<"with_device" | "separate" | "other_supplier" | "bulk">("with_device")
  const [poId, setPoId] = useState("")
  const [units, setUnits] = useState("1")

  function handleCreateProduct() {
    if (!nameEn.trim() || !nameAr.trim()) return
    startTransition(async () => {
      const result = await createWarrantyProduct({
        nameEn: nameEn.trim(),
        nameAr: nameAr.trim(),
        durationMonths: parseInt(duration, 10) || 12,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      setNameEn("")
      setNameAr("")
      router.refresh()
    })
  }

  function handleCreateBatch() {
    if (!productId) return
    startTransition(async () => {
      const result = await createWarrantyBatch({
        warrantyProductId: productId,
        source,
        purchaseOrderId: poId || undefined,
        unitsCovered: parseInt(units, 10) || 1,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">{t("product")}</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="English name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          <Input placeholder="الاسم العربي" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Duration (months)</Label>
          <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <Button size="sm" onClick={handleCreateProduct} disabled={pending || !nameEn.trim() || !nameAr.trim()}>
          {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
          Save
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">{t("batch")}</p>
        <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nameEn}
            </option>
          ))}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="with_device">with_device</option>
          <option value="separate">separate</option>
          <option value="other_supplier">other_supplier</option>
          <option value="bulk">bulk</option>
        </Select>
        <Select value={poId} onChange={(e) => setPoId(e.target.value)}>
          <option value="">— no purchase order —</option>
          {purchaseOrders.map((po) => (
            <option key={po.id} value={po.id}>
              {po.poNumber}
            </option>
          ))}
        </Select>
        <div>
          <Label className="text-xs">Units covered</Label>
          <Input type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} />
        </div>
        <Button size="sm" onClick={handleCreateBatch} disabled={pending || !productId}>
          {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}
