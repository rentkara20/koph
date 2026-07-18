"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateBrandingSettings, type BrandingSettings } from "@/lib/actions/settings"
import type { EnglishFontFamily } from "@/lib/domain/fonts"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { translateActionError } from "@/lib/i18n/action-errors"

export function BrandingSettingsForm({ initial }: { initial: BrandingSettings }) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const result = await updateBrandingSettings(values)
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
      } else {
        toast.success("Settings saved")
        router.refresh()
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="defaultLocale" className="text-xs">
          Default language for new accounts
        </Label>
        <Select
          id="defaultLocale"
          value={values.defaultLocale}
          onChange={(e) => setValues((v) => ({ ...v, defaultLocale: e.target.value as "en" | "ar" }))}
        >
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          Applied when a new staff or partner account is created and hasn&apos;t picked a language yet.
          Existing sessions keep whatever they last selected.
        </p>
      </div>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="englishFontFamily" className="text-xs">
          English interface font
        </Label>
        <Select
          id="englishFontFamily"
          value={values.englishFontFamily}
          onChange={(e) =>
            setValues((v) => ({ ...v, englishFontFamily: e.target.value as EnglishFontFamily }))
          }
        >
          <option value="geist">Geist Sans (default)</option>
          <option value="poppins">Poppins</option>
          <option value="outfit">Outfit</option>
          <option value="plusJakartaSans">Plus Jakarta Sans</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          Applies to the English UI platform-wide. Arabic keeps the Cairo typeface.
        </p>
      </div>

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </form>
  )
}
