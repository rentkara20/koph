"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import Link from "next/link"
import { updateCustomer } from "@/lib/actions/customers"
import type { Customer } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const t = useTranslations("customers")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    setSaved(false)

    try {
      const formData = new FormData(e.currentTarget)
      const result = await updateCustomer(customer.id, formData)
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
        setLoading(false)
        return
      }
      toast.success(tToast("updated"))
      setSaved(true)
      setLoading(false)
      router.refresh()
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
          <Input id="name" name="name" defaultValue={customer.name} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactPerson">
            {t("contactPerson")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="contactPerson" name="contactPerson" defaultValue={customer.contactPerson ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mobile">
            {t("mobile")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="mobile" name="mobile" type="tel" defaultValue={customer.mobile ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">
            {t("email")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="email" name="email" type="email" defaultValue={customer.email ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="city">
            {t("city")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="city" name="city" defaultValue={customer.city ?? ""} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">
            {t("address")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input id="address" name="address" defaultValue={customer.address ?? ""} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="mapsLink">
            {t("mapsLink")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input
            id="mapsLink"
            name="mapsLink"
            type="url"
            placeholder="https://maps.google.com/..."
            defaultValue={customer.mapsLink ?? ""}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">
            {tCommon("notes")}{" "}
            <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={customer.notes ?? ""} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      <div className="flex gap-3 justify-end">
        <Link href="/admin/customers" className={cn(buttonVariants({ variant: "outline" }))}>
          {tCommon("back")}
        </Link>
        <Button type="submit" disabled={loading}>
          {loading ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  )
}
