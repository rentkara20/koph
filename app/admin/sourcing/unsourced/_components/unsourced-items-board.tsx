"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { sendConsolidatedSupplierRfq, type UnsourcedItem } from "@/lib/actions/sourcing-consolidated"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { Supplier } from "@/lib/db/schema"

// Sourcing V3, entry point 2: every pending item across every open request,
// pick a subset (any mix of requests/customers) and send ONE RFQ to ONE
// supplier — the consolidated counterpart to the per-request SendRfqForm.
export function UnsourcedItemsBoard({
  items,
  suppliers,
}: {
  items: UnsourcedItem[]
  suppliers: Supplier[]
}) {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [supplierId, setSupplierId] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await sendConsolidatedSupplierRfq({ supplierId, itemIds: selectedItems })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("rfqsSent"))
      setSelectedItems([])
      setSupplierId("")
      router.refresh()
    })
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("unsourced.empty")}</p>
  }

  // Selected items may span several requests/customers — that's the point.
  const selectedRequestCount = new Set(
    items.filter((i) => selectedItems.includes(i.id)).map((i) => i.sourcingRequestId)
  ).size

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-3" />
              <th className="p-3">{t("externalRef")}</th>
              <th className="p-3">{t("unsourced.item")}</th>
              <th className="p-3">{t("unsourced.quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                </td>
                <td className="p-3" dir="ltr">
                  {item.requestExternalRef ?? "—"}
                </td>
                <td className="p-3">
                  {item.supplierDescription}
                  {item.partNumber && <span className="text-muted-foreground"> · {item.partNumber}</span>}
                </td>
                <td className="p-3">{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="min-w-48 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("selectSuppliers")}</p>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">{t("unsourced.pickSupplier")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        {selectedItems.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("unsourced.selectionSummary", {
              itemCount: selectedItems.length,
              requestCount: selectedRequestCount,
            })}
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={pending || !supplierId || selectedItems.length === 0}
          size="sm"
        >
          {pending && <Loader2 className="me-2 size-4 animate-spin" />}
          {t("sendRfq")}
        </Button>
      </div>
    </div>
  )
}
