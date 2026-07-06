"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, MapPin, Phone, Mail, Check, X } from "lucide-react"
import {
  createCustomerContact,
  updateCustomerContact,
  deleteCustomerContact,
  type ContactInput,
} from "@/lib/actions/customer-contacts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { translateActionError } from "@/lib/i18n/action-errors"

type Contact = {
  id: string
  name: string
  role: string | null
  mobile: string | null
  email: string | null
  city: string | null
  address: string | null
  mapsLink: string | null
  notes: string | null
  isAuthorizedSignatory: boolean
}

function ContactForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Contact
  onSave: (data: ContactInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [role, setRole] = useState(initial?.role ?? "")
  const [mobile, setMobile] = useState(initial?.mobile ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  const [city, setCity] = useState(initial?.city ?? "")
  const [address, setAddress] = useState(initial?.address ?? "")
  const [mapsLink, setMapsLink] = useState(initial?.mapsLink ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [isAuthorizedSignatory, setIsAuthorizedSignatory] = useState(initial?.isAuthorizedSignatory ?? false)

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
      <p className="text-sm font-medium">{initial ? "Edit contact" : "New contact"}</p>
      <Separator />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Role / Title</Label>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. IT Manager, Warehouse" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mobile</Label>
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+966…" inputMode="tel" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. RUH, JED, DMM" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Address / Branch location</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Building, floor, room…" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Google Maps link</Label>
          <Input value={mapsLink} onChange={(e) => setMapsLink(e.target.value)} placeholder="https://maps.google.com/…" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions…" />
        </div>
        <label className="sm:col-span-2 flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isAuthorizedSignatory}
            onChange={(e) => setIsAuthorizedSignatory(e.target.checked)}
            className="mt-0.5 size-4 accent-kara-purple"
          />
          <span>
            Authorised to sign delivery notes
            <span className="block text-xs text-muted-foreground">
              If the receiver is not authorised, a second signing stage is sent to an authorised signatory.
            </span>
          </span>
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="size-3.5" />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || !name.trim()}
          onClick={() => onSave({ name, role, mobile, email, city, address, mapsLink, notes, isAuthorizedSignatory })}
        >
          <Check className="size-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

export function ContactsSection({
  customerId,
  initialContacts,
}: {
  customerId: string
  initialContacts: Contact[]
}) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function handleCreate(data: ContactInput) {
    setSaving(true)
    setError("")
    try {
      const result = await createCustomerContact(customerId, data)
      if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); return }
      toast.success(tToast("created"))
      setAddingNew(false)
      router.refresh()
    } catch {
      setError("Failed to save. Please try again.")
      toast.error(tToast("genericError"))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: string, data: ContactInput) {
    setSaving(true)
    setError("")
    try {
      const result = await updateCustomerContact(id, customerId, data)
      if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); return }
      toast.success(tToast("updated"))
      setContacts((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                name: data.name,
                role: data.role ?? null,
                mobile: data.mobile ?? null,
                email: data.email ?? null,
                city: data.city ?? null,
                address: data.address ?? null,
                mapsLink: data.mapsLink ?? null,
                notes: data.notes ?? null,
                isAuthorizedSignatory: data.isAuthorizedSignatory ?? false,
              }
            : c
        )
      )
      setEditingId(null)
    } catch {
      setError("Failed to save. Please try again.")
      toast.error(tToast("genericError"))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return
    setDeletingId(id)
    try {
      const result = await deleteCustomerContact(id, customerId)
      if (result?.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); setDeletingId(null); return }
      toast.success(tToast("deleted"))
      setContacts((prev) => prev.filter((c) => c.id !== id))
    } catch {
      toast.error(tToast("genericError"))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive">{error}</p>}

      {contacts.length === 0 && !addingNew ? (
        <p className="text-sm text-muted-foreground">No contacts yet. Add employees or branches who receive orders.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) =>
            editingId === c.id ? (
              <ContactForm
                key={c.id}
                initial={c}
                onSave={(data) => handleUpdate(c.id, data)}
                onCancel={() => setEditingId(null)}
                saving={saving}
              />
            ) : (
              <div key={c.id} className="rounded-lg border p-3 group">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.isAuthorizedSignatory && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Authorised signatory
                        </span>
                      )}
                    </div>
                    {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setAddingNew(false); setEditingId(c.id) }}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {c.mobile && (
                    <a
                      href={`tel:${c.mobile}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Phone className="size-3" />
                      {c.mobile}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Mail className="size-3" />
                      {c.email}
                    </a>
                  )}
                  {c.city && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                      <MapPin className="size-3" />
                      {c.city}
                    </span>
                  )}
                  {c.address && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {c.address}
                    </span>
                  )}
                  {c.mapsLink && (
                    <a
                      href={c.mapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline underline-offset-4"
                    >
                      View on map
                    </a>
                  )}
                </div>
                {c.notes && (
                  <p className="mt-1.5 text-xs text-muted-foreground italic">{c.notes}</p>
                )}
              </div>
            )
          )}
        </div>
      )}

      {addingNew && (
        <ContactForm
          onSave={handleCreate}
          onCancel={() => setAddingNew(false)}
          saving={saving}
        />
      )}

      {!addingNew && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { setEditingId(null); setAddingNew(true) }}
        >
          <Plus className="size-3.5" />
          Add contact / branch
        </Button>
      )}
    </div>
  )
}
