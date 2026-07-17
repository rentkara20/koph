"use client"

import { useState, useTransition } from "react"
import { Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet } from "@/components/ui/sheet"
import { createCustomer } from "@/lib/actions/customers"
import { createSupplier } from "@/lib/actions/suppliers"
import { translateActionError } from "@/lib/i18n/action-errors"

type PartyKind = "customer" | "supplier"

export function InlineCreateParty({
  kind,
  onCreated,
}: {
  kind: PartyKind
  onCreated: (party: { id: string; name: string }) => void
}) {
  const t = useTranslations("inlineCreate")
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
      const result = kind === "customer"
        ? await createCustomer(formData)
        : await createSupplier(formData)
      if (result.error || !result.id) {
        const message = translateActionError(result.error ?? "Failed to create")
        setError(message)
        toast.error(message)
        return
      }
      onCreated({ id: result.id, name })
      toast.success(t("created"))
      form.reset()
      setOpen(false)
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="icon" onClick={() => setOpen(true)} aria-label={t(`add.${kind}`)}>
        <Plus className="size-4" />
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side="end"
        title={t(`title.${kind}`)}
        panelClassName="w-[26rem] max-w-full"
      >
        <div className="h-full overflow-y-auto p-5 pt-14">
          <h2 className="text-lg font-semibold">{t(`title.${kind}`)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`quick-${kind}-name`}>{t("name")} *</Label>
              <Input id={`quick-${kind}-name`} name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`quick-${kind}-contact`}>{t("contactPerson")}</Label>
              <Input id={`quick-${kind}-contact`} name="contactPerson" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`quick-${kind}-mobile`}>{t("mobile")}</Label>
              <Input id={`quick-${kind}-mobile`} name="mobile" type="tel" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`quick-${kind}-email`}>{t("email")}</Label>
              <Input id={`quick-${kind}-email`} name="email" type="email" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`quick-${kind}-city`}>{t("city")}</Label>
              <Input id={`quick-${kind}-city`} name="city" />
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
