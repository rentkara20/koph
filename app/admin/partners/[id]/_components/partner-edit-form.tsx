"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import Link from "next/link"
import { updatePartner } from "@/lib/actions/partners"
import type { Partner } from "@/lib/db/schema"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

export function PartnerEditForm({ partner }: { partner: Partner }) {
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(""); setSaved(false); setLoading(true)
    try {
      const result = await updatePartner(partner.id, new FormData(e.currentTarget))
      if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); setLoading(false); return }
      toast.success(tToast("updated"))
      setSaved(true); setLoading(false); router.refresh()
    } catch {
      setError("An unexpected error occurred"); toast.error(tToast("genericError")); setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
          <Input id="name" name="name" defaultValue={partner.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactPerson">Contact person <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
          <Input id="contactPerson" name="contactPerson" defaultValue={partner.contactPerson ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mobile">Mobile <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
          <Input id="mobile" name="mobile" type="tel" defaultValue={partner.mobile ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
          <Input id="email" name="email" type="email" defaultValue={partner.email ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">City <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
          <Input id="city" name="city" defaultValue={partner.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={partner.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">{tCommon("notes")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={partner.notes ?? ""} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}
      <div className="flex gap-3 justify-end">
        <Link href="/admin/partners" className={cn(buttonVariants({ variant: "outline" }))}>{tCommon("back")}</Link>
        <Button type="submit" disabled={loading}>{loading ? tCommon("loading") : tCommon("save")}</Button>
      </div>
    </form>
  )
}
