"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { updateSupplier } from "@/lib/actions/suppliers"
import type { Supplier } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { translateActionError } from "@/lib/i18n/action-errors"

export function SupplierEditForm({
  supplier,
  onCancel,
  onSaved,
}: {
  supplier: Supplier
  onCancel?: () => void
  onSaved?: () => void
}) {
  const t = useTranslations("suppliers")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const formData = new FormData(e.currentTarget)
      const result = await updateSupplier(supplier.id, formData)
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
        setLoading(false)
        return
      }
      toast.success(tToast("updated"))
      setLoading(false)
      router.refresh()
      onSaved?.()
    } catch {
      setError("An unexpected error occurred")
      toast.error(tToast("genericError"))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">
            {t("name")} <span className="text-destructive">*</span>
          </Label>
          <Input id="name" name="name" defaultValue={supplier.name} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactPerson">
            {t("contactPerson")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="contactPerson" name="contactPerson" defaultValue={supplier.contactPerson ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mobile">
            {t("mobile")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="mobile" name="mobile" type="tel" defaultValue={supplier.mobile ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">
            {t("email")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="email" name="email" type="email" defaultValue={supplier.email ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="city">
            {t("city")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="city" name="city" defaultValue={supplier.city ?? ""} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">
            {t("address")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="address" name="address" defaultValue={supplier.address ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pickupContactName">
            {t("pickupContactName")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="pickupContactName" name="pickupContactName" defaultValue={supplier.pickupContactName ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pickupContactMobile">
            {t("pickupContactMobile")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="pickupContactMobile" name="pickupContactMobile" dir="ltr" defaultValue={supplier.pickupContactMobile ?? ""} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pickupMapsUrl">
            {t("pickupMapsUrl")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="pickupMapsUrl" name="pickupMapsUrl" dir="ltr" defaultValue={supplier.pickupMapsUrl ?? ""} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">
            {tCommon("notes")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={supplier.notes ?? ""} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => onCancel?.()} disabled={loading}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  )
}
