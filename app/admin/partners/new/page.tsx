"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createPartner } from "@/lib/actions/partners"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

export default function NewPartnerPage() {
  const t = useTranslations("partners")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await createPartner(new FormData(e.currentTarget))
      if (result.error) { setError(translateActionError(result.error)); setLoading(false); return }
      router.push(`/admin/partners/${result.id}`)
    } catch {
      setError("An unexpected error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/partners" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("title")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">{t("name")} <span className="text-destructive">*</span></Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactPerson">Contact person <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Input id="contactPerson" name="contactPerson" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mobile">Mobile <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Input id="mobile" name="mobile" type="tel" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Input id="city" name="city" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">{tCommon("status")}</Label>
                <Select id="status" name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">{tCommon("notes")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Textarea id="notes" name="notes" rows={3} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-3 justify-end">
              <Link href="/admin/partners" className={cn(buttonVariants({ variant: "outline" }))}>{tCommon("cancel")}</Link>
              <Button type="submit" disabled={loading}>{loading ? tCommon("loading") : tCommon("save")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
