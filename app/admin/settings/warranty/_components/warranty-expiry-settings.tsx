"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateWarrantySettings } from "@/lib/actions/settings"
import { translateActionError } from "@/lib/i18n/action-errors"

export function WarrantyExpirySettings({ expiryAlertDays }: { expiryAlertDays: number }) {
  const t = useTranslations("warranty")
  const router = useRouter()
  const [value, setValue] = useState(String(expiryAlertDays))
  const [pending, startTransition] = useTransition()

  function handleSave() {
    const n = parseInt(value, 10)
    if (!Number.isFinite(n)) return
    startTransition(async () => {
      const result = await updateWarrantySettings({ expiryAlertDays: n })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("settingsSaved"))
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
      <div>
        <Label className="text-xs">{t("expiryAlertDays")}</Label>
        <Input
          type="number"
          min={1}
          max={180}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28"
          dir="ltr"
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("expiryAlertDaysHint")}</p>
      </div>
      <Button size="sm" onClick={handleSave} disabled={pending}>
        {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
        {t("saveSettings")}
      </Button>
    </div>
  )
}
