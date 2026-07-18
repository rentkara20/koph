"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createWarrantyBatch } from "@/lib/actions/warranty"
import { translateActionError } from "@/lib/i18n/action-errors"
import { cn } from "@/lib/utils"
import type { WarrantyProduct } from "@/lib/db/schema"

type PoOption = { id: string; poNumber: string }
type SupplierOption = { id: string; name: string }

export function WarrantySetup({
  products,
  purchaseOrders,
  suppliers,
}: {
  products: WarrantyProduct[]
  purchaseOrders: PoOption[]
  suppliers: SupplierOption[]
}) {
  const t = useTranslations("warranty")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [productId, setProductId] = useState(products[0]?.id ?? "")
  const [source, setSource] = useState<"with_device" | "separate" | "other_supplier" | "bulk">("with_device")
  const [poId, setPoId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [units, setUnits] = useState("1")

  function handleCreateBatch() {
    if (!productId) return
    startTransition(async () => {
      const result = await createWarrantyBatch({
        warrantyProductId: productId,
        source,
        purchaseOrderId: poId || undefined,
        supplierId: supplierId || undefined,
        unitsCovered: parseInt(units, 10) || 1,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      router.refresh()
    })
  }

  // A batch always belongs to a product (AppleCare+, Lenovo ADP, …) — with
  // no products defined yet there's nothing to attach a batch to, so guide
  // the operator to Warranty Configuration instead of showing a dead form.
  if (products.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">{t("noProductsYet")}</p>
        <Link href="/admin/settings/warranty" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {t("goToSettings")}
        </Link>
      </div>
    )
  }

  return (
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
        <Label className="text-xs">{t("supplier")}</Label>
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— inherit from PO —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label className="text-xs">Units covered</Label>
        <Input type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} />
      </div>
      <Button size="sm" onClick={handleCreateBatch} disabled={pending || !productId}>
        {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
        Save
      </Button>
    </div>
  )
}
