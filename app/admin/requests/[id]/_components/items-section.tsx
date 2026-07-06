"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Pencil, Trash2, Plus, Check, X } from "lucide-react"
import { updateRequestItem, deleteRequestItem, addRequestItem } from "@/lib/actions/requests"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"

type Item = {
  id: string
  description: string
  brand: string | null
  model: string | null
  serialNumber: string | null
  quantity: number
  accessories: string | null
  notes: string | null
}

function ItemEditRow({
  item,
  onSave,
  onCancel,
}: {
  item: Partial<Item> & { description: string; quantity: number }
  onSave: (data: Item) => void
  onCancel: () => void
}) {
  const [description, setDescription] = useState(item.description)
  const [brand, setBrand] = useState(item.brand ?? "")
  const [model, setModel] = useState(item.model ?? "")
  const [serialNumber, setSerialNumber] = useState(item.serialNumber ?? "")
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [accessories, setAccessories] = useState(item.accessories ?? "")
  const [saving, setSaving] = useState(false)

  function handleSave() {
    if (!description.trim()) return
    setSaving(true)
    onSave({
      id: item.id ?? "",
      description: description.trim(),
      brand: brand.trim() || null,
      model: model.trim() || null,
      serialNumber: serialNumber.trim() || null,
      quantity: parseInt(quantity) || 1,
      accessories: accessories.trim() || null,
      notes: item.notes ?? null,
    })
  }

  return (
    <tr className="bg-muted/20">
      <td className="px-3 py-2" colSpan={4}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Description *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Brand</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Model</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Serial number</Label>
            <Input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div className="sm:col-span-3 space-y-1">
            <Label className="text-xs">Accessories</Label>
            <Input
              value={accessories}
              onChange={(e) => setAccessories(e.target.value)}
              className="h-7 text-xs"
              placeholder="charger, case, adapter…"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            <X className="size-3.5" />
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || !description.trim()}>
            <Check className="size-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </td>
    </tr>
  )
}

export function ItemsSection({
  requestId,
  initialItems,
}: {
  requestId: string
  initialItems: Item[]
}) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [items, setItems] = useState<Item[]>(initialItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function handleSaveEdit(data: Item) {
    setError("")
    const result = await updateRequestItem(data.id, {
      description: data.description,
      brand: data.brand ?? undefined,
      model: data.model ?? undefined,
      serialNumber: data.serialNumber ?? undefined,
      quantity: data.quantity,
      accessories: data.accessories ?? undefined,
      notes: data.notes ?? undefined,
    })
    if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); return }
    toast.success(tToast("updated"))
    setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)))
    setEditingId(null)
  }

  async function handleDelete(itemId: string) {
    if (!confirm("Delete this item?")) return
    setDeletingId(itemId)
    try {
      const result = await deleteRequestItem(itemId, requestId)
      if (result?.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); setDeletingId(null); return }
      toast.success(tToast("deleted"))
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch {
      toast.error(tToast("genericError"))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleAddNew(data: Item) {
    setError("")
    const result = await addRequestItem(requestId, {
      description: data.description,
      brand: data.brand ?? undefined,
      model: data.model ?? undefined,
      serialNumber: data.serialNumber ?? undefined,
      quantity: data.quantity,
      accessories: data.accessories ?? undefined,
      notes: data.notes ?? undefined,
    })
    if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); return }
    toast.success(tToast("created"))
    const newItem: Item = { ...data, id: result.id! }
    setItems((prev) => [...prev, newItem])
    setAddingNew(false)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Description</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">
              Brand / Model
            </th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">
              S/N
            </th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Qty</th>
            <th className="px-2 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) =>
            editingId === item.id ? (
              <ItemEditRow
                key={item.id}
                item={item}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <tr key={item.id} className="group">
                <td className="px-4 py-3">
                  <p className="font-medium">{item.description}</p>
                  {item.accessories && (
                    <p className="text-xs text-muted-foreground mt-0.5">+{item.accessories}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                  {[item.brand, item.model].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden md:table-cell">
                  {item.serialNumber ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.quantity}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setAddingNew(false); setEditingId(item.id) }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
          {addingNew && (
            <ItemEditRow
              item={{ description: "", quantity: 1 }}
              onSave={handleAddNew}
              onCancel={() => setAddingNew(false)}
            />
          )}
        </tbody>
      </table>

      {!addingNew && (
        <div className="px-4 pb-2">
          <button
            onClick={() => { setEditingId(null); setAddingNew(true) }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <Plus className="size-3.5" />
            Add item
          </button>
        </div>
      )}
    </div>
  )
}
