"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ChevronUp, ChevronDown, Pencil, Check, X, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { translateActionError } from "@/lib/i18n/action-errors"

export type NamedListItem = {
  id: string
  slug?: string
  nameEn: string
  nameAr: string
  isActive: boolean
  sortOrder: number
}

type ActionResult = { error?: string; id?: string }

interface NamedListManagerProps {
  items: NamedListItem[]
  actions: {
    create: (data: { nameEn: string; nameAr: string }) => Promise<ActionResult>
    update: (id: string, data: { nameEn?: string; nameAr?: string }) => Promise<ActionResult>
    toggle: (id: string) => Promise<ActionResult>
    move: (id: string, direction: "up" | "down") => Promise<ActionResult>
  }
  emptyLabel: string
  addLabel: string
  /** Items whose slug is in this set show a lock icon and skip the disable action (system-relied-on values). */
  lockedSlugs?: readonly string[]
}

export function NamedListManager({ items, actions, emptyLabel, addLabel, lockedSlugs = [] }: NamedListManagerProps) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const tCommon = useTranslations("common")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEn, setEditEn] = useState("")
  const [editAr, setEditAr] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [addEn, setAddEn] = useState("")
  const [addAr, setAddAr] = useState("")
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function run(key: string, fn: () => Promise<ActionResult>, successKey?: string) {
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

  function startEdit(item: NamedListItem) {
    setEditingId(item.id)
    setEditEn(item.nameEn)
    setEditAr(item.nameAr)
  }

  async function saveEdit(id: string) {
    await run(`edit-${id}`, () => actions.update(id, { nameEn: editEn, nameAr: editAr }), "updated")
    setEditingId(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    await run("add", () => actions.create({ nameEn: addEn, nameAr: addAr }), "created")
    setAddEn("")
    setAddAr("")
    setShowAdd(false)
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{emptyLabel}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {items.map((item, idx) => {
            const locked = item.slug ? lockedSlugs.includes(item.slug) : false
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    disabled={idx === 0 || loading !== null}
                    onClick={() => run(`up-${item.id}`, () => actions.move(item.id, "up"))}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label={tCommon("moveUp")}
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    disabled={idx === items.length - 1 || loading !== null}
                    onClick={() => run(`down-${item.id}`, () => actions.move(item.id, "down"))}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label={tCommon("moveDown")}
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>

                {editingId === item.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={editEn}
                      onChange={(e) => setEditEn(e.target.value)}
                      placeholder={tCommon("nameEnglish")}
                      className="h-9 min-w-0 flex-1 text-sm"
                    />
                    <Input
                      value={editAr}
                      onChange={(e) => setEditAr(e.target.value)}
                      placeholder={tCommon("nameArabic")}
                      className="h-9 min-w-0 flex-1 text-sm"
                      dir="rtl"
                    />
                    <button
                      onClick={() => saveEdit(item.id)}
                      disabled={loading !== null}
                      className="flex size-9 items-center justify-center text-green-600 hover:text-green-700"
                      aria-label={tCommon("save")}
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={tCommon("cancel")}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {item.nameEn}
                      {locked && <Lock className="size-3 text-muted-foreground" aria-label={tCommon("systemManaged")} />}
                    </p>
                    <p className="text-xs text-muted-foreground" dir="rtl">
                      {item.nameAr}
                    </p>
                  </div>
                )}

                {editingId !== item.id && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={item.isActive ? "success" : "secondary"}>
                      {item.isActive ? tCommon("active") : tCommon("inactive")}
                    </Badge>
                    <button
                      onClick={() => startEdit(item)}
                      className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={tCommon("edit")}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {!locked && (
                      <button
                        onClick={() => run(`toggle-${item.id}`, () => actions.toggle(item.id))}
                        disabled={loading !== null}
                        className="min-h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {item.isActive ? tCommon("disable") : tCommon("enable")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!showAdd ? (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          {addLabel}
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">{addLabel}</p>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {tCommon("nameEnglish")} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={addEn}
                onChange={(e) => setAddEn(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {tCommon("nameArabic")} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={addAr}
                onChange={(e) => setAddAr(e.target.value)}
                required
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
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={loading === "add"}>
              {loading === "add" ? tCommon("adding") : addLabel}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
