"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ChevronUp, ChevronDown, Pencil, Check, X } from "lucide-react"
import {
  createService,
  updateService,
  toggleService,
  moveService,
} from "@/lib/actions/services"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { translateActionError } from "@/lib/i18n/action-errors"

type Service = {
  id: string
  nameEn: string
  nameAr: string
  isActive: boolean
  sortOrder: number
}

export function ServicesManager({ services }: { services: Service[] }) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEn, setEditEn] = useState("")
  const [editAr, setEditAr] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [addEn, setAddEn] = useState("")
  const [addAr, setAddAr] = useState("")
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function run(key: string, fn: () => Promise<{ error?: string }>, successKey?: string) {
    setLoading(key)
    try {
      const result = await fn()
      setLoading(null)
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
      } else {
        setError("")
        if (successKey) toast.success(tToast(successKey))
        router.refresh()
      }
    } catch {
      setLoading(null)
      toast.error(tToast("genericError"))
    }
  }

  function startEdit(svc: Service) {
    setEditingId(svc.id)
    setEditEn(svc.nameEn)
    setEditAr(svc.nameAr)
  }

  async function saveEdit(id: string) {
    await run(`edit-${id}`, () => updateService(id, { nameEn: editEn, nameAr: editAr }), "updated")
    setEditingId(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    await run("add", () => createService({ nameEn: addEn, nameAr: addAr }), "created")
    setAddEn("")
    setAddAr("")
    setShowAdd(false)
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No services yet. Add the first one below.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {services.map((svc, idx) => (
            <div key={svc.id} className="flex items-center gap-3 px-4 py-3">
              {/* Reorder */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  disabled={idx === 0 || loading !== null}
                  onClick={() => run(`up-${svc.id}`, () => moveService(svc.id, "up"))}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="size-3" />
                </button>
                <button
                  disabled={idx === services.length - 1 || loading !== null}
                  onClick={() => run(`down-${svc.id}`, () => moveService(svc.id, "down"))}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>

              {/* Name */}
              {editingId === svc.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={editEn}
                    onChange={(e) => setEditEn(e.target.value)}
                    placeholder="English"
                    className="h-7 text-xs"
                  />
                  <Input
                    value={editAr}
                    onChange={(e) => setEditAr(e.target.value)}
                    placeholder="عربي"
                    className="h-7 text-xs"
                    dir="rtl"
                  />
                  <button
                    onClick={() => saveEdit(svc.id)}
                    disabled={loading !== null}
                    className="text-green-600 hover:text-green-700 p-1"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{svc.nameEn}</p>
                  <p className="text-xs text-muted-foreground" dir="rtl">
                    {svc.nameAr}
                  </p>
                </div>
              )}

              {/* Status + actions */}
              {editingId !== svc.id && (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={svc.isActive ? "success" : "secondary"}>
                    {svc.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <button
                    onClick={() => startEdit(svc)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => run(`toggle-${svc.id}`, () => toggleService(svc.id))}
                    disabled={loading !== null}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {svc.isActive ? "Disable" : "Enable"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add service form */}
      {!showAdd ? (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          Add service
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">New service</p>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Name (English) <span className="text-destructive">*</span>
              </Label>
              <Input
                value={addEn}
                onChange={(e) => setAddEn(e.target.value)}
                required
                placeholder="e.g. Installation"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                الاسم (عربي) <span className="text-destructive">*</span>
              </Label>
              <Input
                value={addAr}
                onChange={(e) => setAddAr(e.target.value)}
                required
                placeholder="مثال: تركيب"
                dir="rtl"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setShowAdd(false); setAddEn(""); setAddAr(""); setError("") }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading === "add"}>
              {loading === "add" ? "Adding…" : "Add service"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
