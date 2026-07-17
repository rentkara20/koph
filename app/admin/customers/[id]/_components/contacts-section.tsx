"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, MapPin, Phone, Mail, Check, X, Building2 } from "lucide-react"
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
import { createAndAssignRequestReceiver } from "@/lib/actions/requests"

export type Contact = {
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

export type ContactLocationOption = {
  id: string
  name: string
  type: string
  city: string | null
  isDefault: boolean
}

export type ContactLocationLink = {
  contactId: string
  locationId: string
  isPrimary: boolean
}

export function ContactForm({
  initial,
  onSave,
  onCancel,
  saving,
  locations,
  initialLinks,
}: {
  initial?: Contact
  onSave: (data: ContactInput) => void
  onCancel: () => void
  saving: boolean
  locations: ContactLocationOption[]
  initialLinks: ContactLocationLink[]
}) {
  const t = useTranslations("customerSites")
  const [name, setName] = useState(initial?.name ?? "")
  const [role, setRole] = useState(initial?.role ?? "")
  const [mobile, setMobile] = useState(initial?.mobile ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  // Legacy contact-level route fields are preserved on save but no longer
  // shown. New route details belong to the selected customer location.
  const city = initial?.city ?? ""
  const address = initial?.address ?? ""
  const mapsLink = initial?.mapsLink ?? ""
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [isAuthorizedSignatory, setIsAuthorizedSignatory] = useState(initial?.isAuthorizedSignatory ?? false)
  const [locationIds, setLocationIds] = useState<string[]>(initialLinks.map((link) => link.locationId))
  const [primaryLocationId, setPrimaryLocationId] = useState(
    initialLinks.find((link) => link.isPrimary)?.locationId ?? ""
  )

  function toggleLocation(locationId: string) {
    setLocationIds((current) => {
      const next = current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId]
      if (!next.includes(primaryLocationId)) setPrimaryLocationId("")
      return next
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
      <p className="text-sm font-medium">{initial ? t("editPerson") : t("newPerson")}</p>
      <Separator />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("personName")} <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("role")}</Label>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("rolePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("mobile")}</Label>
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+966…" inputMode="tel" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("email")}</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">{t("personNotes")}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("personNotesPlaceholder")} />
        </div>
        {locations.length > 0 && (
          <div className="sm:col-span-2 space-y-2 rounded-lg border bg-background p-3">
            <div>
              <p className="text-sm font-medium">{t("workLocations")}</p>
              <p className="text-xs text-muted-foreground">{t("workLocationsHint")}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {locations.map((location) => (
                <label key={location.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={locationIds.includes(location.id)}
                    onChange={() => toggleLocation(location.id)}
                    className="size-4 rounded border-input"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{location.name}</span>
                    {location.city && <span className="block text-xs text-muted-foreground">{location.city}</span>}
                  </span>
                </label>
              ))}
            </div>
            {locationIds.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("preferredLocation")}</Label>
                <select
                  value={primaryLocationId}
                  onChange={(event) => setPrimaryLocationId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t("noPreferredLocation")}</option>
                  {locations.filter((location) => locationIds.includes(location.id)).map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        <label className="sm:col-span-2 flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isAuthorizedSignatory}
            onChange={(e) => setIsAuthorizedSignatory(e.target.checked)}
            className="mt-0.5 size-4 accent-kara-purple"
          />
          <span>
            {t("authorizedSignatory")}
            <span className="block text-xs text-muted-foreground">
              {t("authorizedSignatoryHint")}
            </span>
          </span>
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="size-3.5" />
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || !name.trim()}
          onClick={() => onSave({ name, role, mobile, email, city, address, mapsLink, notes, isAuthorizedSignatory, locationIds, primaryLocationId: primaryLocationId || null })}
        >
          <Check className="size-3.5" />
          {saving ? t("saving") : t("savePerson")}
        </Button>
      </div>
    </div>
  )
}

export function ContactsSection({
  customerId,
  initialContacts,
  returnTo,
  assignToRequestId,
  locations,
  contactLocationLinks,
}: {
  customerId: string
  initialContacts: Contact[]
  returnTo?: string
  assignToRequestId?: string
  locations: ContactLocationOption[]
  contactLocationLinks: ContactLocationLink[]
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
      const result = assignToRequestId
        ? await createAndAssignRequestReceiver(assignToRequestId, data)
        : await createCustomerContact(customerId, data)
      if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); return }
      toast.success(tToast("created"))
      setAddingNew(false)
      if (returnTo) router.push(returnTo)
      else router.refresh()
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
        <p className="text-sm text-muted-foreground">No contacts yet. Add employees who receive or hand over devices.</p>
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
                locations={locations}
                initialLinks={contactLocationLinks.filter((link) => link.contactId === c.id)}
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
                      className="flex size-10 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="flex size-10 items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
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
                {contactLocationLinks.some((link) => link.contactId === c.id) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {contactLocationLinks.filter((link) => link.contactId === c.id).map((link) => {
                      const location = locations.find((item) => item.id === link.locationId)
                      if (!location) return null
                      return (
                        <span key={link.locationId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          <Building2 className="size-3" />
                          {location.name}{link.isPrimary ? " · Primary" : ""}
                        </span>
                      )
                    })}
                  </div>
                )}
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
            locations={locations}
            initialLinks={[]}
        />
      )}

      {!addingNew && (
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => { setEditingId(null); setAddingNew(true) }}
        >
          <Plus className="size-3.5" />
          Add contact
        </Button>
      )}
    </div>
  )
}
