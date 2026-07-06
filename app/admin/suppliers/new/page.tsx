"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createSupplier } from "@/lib/actions/suppliers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

export default function NewSupplierPage() {
  const t = useTranslations("suppliers")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const formData = new FormData(e.currentTarget)
      const result = await createSupplier(formData)
      if (result.error) {
        setError(translateActionError(result.error))
        setLoading(false)
        return
      }
      router.push(`/admin/suppliers/${result.id}`)
    } catch {
      setError("An unexpected error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/suppliers"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">
                  {t("name")} <span className="text-destructive">*</span>
                </Label>
                <Input id="name" name="name" required autoFocus />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contactPerson">
                  {t("contactPerson")}{" "}
                  <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
                </Label>
                <Input id="contactPerson" name="contactPerson" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mobile">
                  {t("mobile")}{" "}
                  <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
                </Label>
                <Input id="mobile" name="mobile" type="tel" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">
                  {t("email")}{" "}
                  <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
                </Label>
                <Input id="email" name="email" type="email" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city">
                  {t("city")}{" "}
                  <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
                </Label>
                <Input id="city" name="city" />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">
                  {t("address")}{" "}
                  <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
                </Label>
                <Input id="address" name="address" />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">
                  {tCommon("notes")}{" "}
                  <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
                </Label>
                <Textarea id="notes" name="notes" rows={3} />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 justify-end">
              <Link href="/admin/suppliers" className={cn(buttonVariants({ variant: "outline" }))}>
                {tCommon("cancel")}
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? tCommon("loading") : tCommon("save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
