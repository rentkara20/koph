"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { createAndAssignRequestReceiver } from "@/lib/actions/requests"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet } from "@/components/ui/sheet"

export function InlineCreateReceiver({ requestId }: { requestId: string }) {
  const t = useTranslations("inlineReceiver")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const name = String(formData.get("name") ?? "").trim()
    if (!name) return

    setError("")
    startTransition(async () => {
      const result = await createAndAssignRequestReceiver(requestId, {
        name,
        role: String(formData.get("role") ?? ""),
        mobile: String(formData.get("mobile") ?? ""),
        email: String(formData.get("email") ?? ""),
        city: String(formData.get("city") ?? ""),
        address: String(formData.get("address") ?? ""),
        mapsLink: String(formData.get("mapsLink") ?? ""),
      })
      if (result.error) {
        const message = translateActionError(result.error)
        setError(message)
        toast.error(message)
        return
      }

      toast.success(t("createdAndSelected"))
      form.reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        {t("add")}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side="end"
        title={t("title")}
        panelClassName="w-[26rem] max-w-full"
      >
        <div className="h-full overflow-y-auto p-5 pt-14">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-receiver-name">{t("name")} *</Label>
              <Input id="quick-receiver-name" name="name" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-receiver-role">{t("role")}</Label>
              <Input id="quick-receiver-role" name="role" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-receiver-mobile">{t("mobile")}</Label>
              <Input id="quick-receiver-mobile" name="mobile" type="tel" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-receiver-email">{t("email")}</Label>
              <Input id="quick-receiver-email" name="email" type="email" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-receiver-city">{t("city")}</Label>
              <Input id="quick-receiver-city" name="city" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-receiver-address">{t("address")}</Label>
              <Input id="quick-receiver-address" name="address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-receiver-maps">{t("mapsLink")}</Label>
              <Input id="quick-receiver-maps" name="mapsLink" type="url" dir="ltr" placeholder="https://maps.google.com/…" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {pending ? t("saving") : t("saveAndSelect")}
              </Button>
            </div>
          </form>
        </div>
      </Sheet>
    </>
  )
}
