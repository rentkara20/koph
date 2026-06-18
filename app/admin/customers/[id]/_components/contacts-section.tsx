"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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

type Contact = {
  id: string
  name: string
  role: string | null
  mobile: string | null
  email: string | null
  address: string | null
  mapsLink: string | null
  notes: string | null
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
  const [address, setAddress] = useState(initial?.address ?? "")
  const [mapsLink, setMapsLink] = useState(initial?.mapsLink ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")

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
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+966…" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
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
          onClick={() => onSave({ name, role, mobile, email, address, mapsLink, notes })}
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
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function handleCreate(data: ContactInput) {
    setSaving(true)
    setError("")
    const result = await createCustomerContact(customerId, data)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setAddingNew(false)
    router.refresh()
    // optimistic update via refresh is fine here
  }

  async function handleUpdate(id: string, data: ContactInput) {
    setSaving(true)
    setError("")
    const result = await updateCustomerContact(id, customerId, data)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setContacts((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              name: data.name,
              role: data.role ?? null,
              mobile: data.mobile ?? null,
              email: data.email ?? null,
              address: data.address ?? null,
              mapsLink: data.mapsLink ?? null,
              notes: data.notes ?? null,
            }
          : c
      )
    )
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return
    setDeletingId(id)
    await deleteCustomerContact(id, customerId)
    setContacts((prev) => prev.filter((c) => c.id !== id))
    setDeletingId(null)
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
                    <p className="font-medium text-sm">{c.name}</p>
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
