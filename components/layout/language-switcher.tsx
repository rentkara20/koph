"use client"

import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()

  async function toggle() {
    const next = locale === "en" ? "ar" : "en"
    document.cookie = `lang=${next};path=/;max-age=31536000`
    router.refresh()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="text-xs font-medium"
      aria-label={locale === "en" ? "التبديل إلى العربية" : "Switch to English"}
      lang={locale === "en" ? "ar" : "en"}
    >
      {locale === "en" ? "العربية" : "English"}
    </Button>
  )
}
