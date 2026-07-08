"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet } from "@/components/ui/sheet"
import { visibleNavItems, BOTTOM_NAV_KEYS } from "./nav-items"

// Thumb-reachable bottom bar for the 4 most-used sections on phones, plus a
// "more" trigger for everything else — avoids burying daily-use pages one
// tap deeper behind the hamburger drawer.
export function BottomNav({ role }: { role?: string }) {
  const pathname = usePathname()
  const t = useTranslations("nav")
  const [moreOpen, setMoreOpen] = useState(false)

  const navItems = visibleNavItems(role)
  const primary = BOTTOM_NAV_KEYS.map((key) => navItems.find((i) => i.key === key)!)
  const rest = navItems.filter((i) => !BOTTOM_NAV_KEYS.includes(i.key as (typeof BOTTOM_NAV_KEYS)[number]))

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label={t("menu")}
      >
        {primary.map(({ key, href, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
                active ? "text-primary font-medium" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" />
              {t(key as Parameters<typeof t>[0])}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
        >
          <Menu className="size-5" />
          {t("more")}
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} side="end" title={t("more")}>
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-sm font-medium">{t("more")}</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {rest.map(({ key, href, icon: Icon, prefetch }) => {
              const active = pathname.startsWith(href)
              return (
                <li key={key}>
                  <Link
                    href={href}
                    prefetch={prefetch}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-base transition-colors",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {t(key as Parameters<typeof t>[0])}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </Sheet>
    </>
  )
}
