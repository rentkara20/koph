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
import { Badge } from "@/components/ui/badge"
import { createAccessoryItem, receiveAccessoryStock } from "@/lib/actions/accessories"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { AccessoryItem } from "@/lib/db/schema"

type StockRow = { id: string; accessoryItemId: string; location: string; qty: number; nameEn: string }
type UnitRow = { id: string; accessoryItemId: string; serialNumber: string | null; status: string; nameEn: string }

export function AccessoriesManager({
  items,
  stock,
  units,
}: {
  items: AccessoryItem[]
  stock: StockRow[]
  units: UnitRow[]
}) {
  const t = useTranslations("accessories")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [nameEn, setNameEn] = useState("")
  const [nameAr, setNameAr] = useState("")
  const [category, setCategory] = useState<"trackable" | "non_serialized" | "serialized_asset">("non_serialized")
  const [requiresSerial, setRequiresSerial] = useState(false)

  const [receiveItemId, setReceiveItemId] = useState(items[0]?.id ?? "")
  const [receiveQty, setReceiveQty] = useState("1")
  const [receiveSerial, setReceiveSerial] = useState("")

  function handleCreateItem() {
    if (!nameEn.trim() || !nameAr.trim()) return
    startTransition(async () => {
      const result = await createAccessoryItem({
        nameEn: nameEn.trim(),
        nameAr: nameAr.trim(),
        category,
        requiresSerial,
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

  function handleReceive() {
    if (!receiveItemId) return
    startTransition(async () => {
      const result = await receiveAccessoryStock({
        accessoryItemId: receiveItemId,
        qty: parseInt(receiveQty, 10) || 1,
        serialNumber: receiveSerial.trim() || undefined,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      setReceiveSerial("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">{t("addItem")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder={t("nameEn")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            <Input placeholder={t("nameAr")} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="non_serialized">{t("categories.non_serialized")}</option>
            <option value="trackable">{t("categories.trackable")}</option>
            <option value="serialized_asset">{t("categories.serialized_asset")}</option>
          </Select>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={requiresSerial} onChange={(e) => setRequiresSerial(e.target.checked)} />
            {t("requiresSerial")}
          </label>
          <Button size="sm" onClick={handleCreateItem} disabled={pending || !nameEn.trim() || !nameAr.trim()}>
            {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
            {t("addItem")}
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">{t("receive")}</p>
          <Select value={receiveItemId} onChange={(e) => setReceiveItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nameEn}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{t("qty")}</Label>
              <Input type="number" min={1} value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("serialNumber")}</Label>
              <Input value={receiveSerial} onChange={(e) => setReceiveSerial(e.target.value)} dir="ltr" />
            </div>
          </div>
          <Button size="sm" onClick={handleReceive} disabled={pending || !receiveItemId}>
            {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
            {t("receive")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">{t("stock")}</p>
          <ul className="space-y-1 text-sm">
            {stock.map((s) => (
              <li key={s.id} className="flex justify-between">
                <span>{s.nameEn}</span>
                <Badge variant="secondary">{s.qty}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">{t("units")}</p>
          <ul className="space-y-1 text-sm">
            {units.map((u) => (
              <li key={u.id} className="flex justify-between">
                <span>
                  {u.nameEn} {u.serialNumber && <span className="font-mono text-xs text-muted-foreground" dir="ltr">{u.serialNumber}</span>}
                </span>
                <Badge variant={u.status === "in_stock" ? "success" : "secondary"}>{u.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
