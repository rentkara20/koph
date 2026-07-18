"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { createWarrantyProduct, updateWarrantyProduct, toggleWarrantyProduct } from "@/lib/actions/warranty"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { WarrantyProduct } from "@/lib/db/schema"

export function WarrantyProductManager({ products }: { products: WarrantyProduct[] }) {
  const t = useTranslations("warranty")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const [nameEn, setNameEn] = useState("")
  const [nameAr, setNameAr] = useState("")
  const [duration, setDuration] = useState("12")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEn, setEditEn] = useState("")
  const [editAr, setEditAr] = useState("")
  const [editDuration, setEditDuration] = useState("")

  function handleCreate() {
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

  function startEdit(p: WarrantyProduct) {
    setEditingId(p.id)
    setEditEn(p.nameEn)
    setEditAr(p.nameAr)
    setEditDuration(String(p.durationMonths))
  }

  async function saveEdit(id: string) {
    setBusyId(id)
    const result = await updateWarrantyProduct(id, {
      nameEn: editEn.trim(),
      nameAr: editAr.trim(),
      durationMonths: parseInt(editDuration, 10) || undefined,
    })
    setBusyId(null)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    setEditingId(null)
    router.refresh()
  }

  async function handleToggle(id: string) {
    setBusyId(id)
    const result = await toggleWarrantyProduct(id)
    setBusyId(null)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {products.length > 0 && (
        <ul className="space-y-1">
          {products.map((p) => (
            <li key={p.id} className="rounded-lg border p-2.5 text-sm">
              {editingId === p.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={editEn}
                    onChange={(e) => setEditEn(e.target.value)}
                    placeholder={tCommon("nameEnglish")}
                    className="h-8 min-w-0 flex-1 text-xs"
                  />
                  <Input
                    value={editAr}
                    onChange={(e) => setEditAr(e.target.value)}
                    placeholder={tCommon("nameArabic")}
                    className="h-8 min-w-0 flex-1 text-xs"
                    dir="rtl"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value)}
                    className="h-8 w-20 text-xs"
                    dir="ltr"
                  />
                  <button
                    onClick={() => saveEdit(p.id)}
                    disabled={busyId === p.id}
                    className="flex size-8 items-center justify-center text-green-600 hover:text-green-700"
                    aria-label={tCommon("save")}
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={tCommon("cancel")}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {p.nameEn} · {p.nameAr}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                    {p.durationMonths}mo
                  </span>
                  <Badge variant={p.isActive ? "success" : "secondary"} className="shrink-0">
                    {p.isActive ? tCommon("active") : tCommon("inactive")}
                  </Badge>
                  <button
                    onClick={() => startEdit(p)}
                    className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={tCommon("edit")}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggle(p.id)}
                    disabled={busyId === p.id}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {p.isActive ? tCommon("disable") : tCommon("enable")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder={tCommon("nameEnglish")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <Input placeholder={tCommon("nameArabic")} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        <div>
          <Label className="text-xs">{t("durationMonths")}</Label>
          <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>
      <Button size="sm" onClick={handleCreate} disabled={pending || !nameEn.trim() || !nameAr.trim()}>
        {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
        {t("saveSettings")}
      </Button>
    </div>
  )
}
