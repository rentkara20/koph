"use client"

import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"

/**
 * Compact AR/EN toggle for the public signing page. Customers arrive with no
 * "lang" cookie, so this sets it explicitly and refreshes the server render.
 */
export function LocaleToggle() {
  const locale = useLocale()
  const router = useRouter()

  function setLang(next: "en" | "ar") {
    if (next === locale) return
    document.cookie = `lang=${next};path=/;max-age=31536000`
    router.refresh()
  }

  const base =
    "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
  const active = "bg-primary-foreground/20 text-primary-foreground"
  const idle = "text-primary-foreground/60 hover:text-primary-foreground"

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-primary-foreground/10 p-0.5">
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`${base} ${locale === "en" ? active : idle}`}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("ar")}
        className={`${base} font-arabic ${locale === "ar" ? active : idle}`}
        aria-pressed={locale === "ar"}
      >
        عربي
      </button>
    </div>
  )
}
