"use client"

import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { cn } from "@/lib/utils"

// Compact AR/EN switch for public token pages (statement, sign, task) where the
// visitor has no admin chrome and may arrive with no "lang" cookie set.
export function LocaleToggle({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const router = useRouter()
  const locale = useLocale()

  function set(next: "en" | "ar") {
    if (next === locale) return
    document.cookie = `lang=${next}; path=/; max-age=31536000`
    router.refresh()
  }

  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-full border text-xs",
        onDark && "border-white/30",
        className
      )}
    >
      {(["en", "ar"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          className={cn(
            "px-3 py-1 font-medium transition-colors",
            locale === l
              ? onDark
                ? "bg-white text-kara-purple"
                : "bg-primary text-primary-foreground"
              : onDark
                ? "text-white/85 hover:bg-white/10"
                : "text-muted-foreground hover:bg-accent"
          )}
        >
          {l === "en" ? "EN" : "عربي"}
        </button>
      ))}
    </div>
  )
}
