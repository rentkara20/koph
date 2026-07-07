"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { ClipboardList, Coins, LayoutDashboard } from "lucide-react"

const items = [
  { key: "overview", href: "/partner", icon: LayoutDashboard },
  { key: "tasks", href: "/partner/tasks", icon: ClipboardList },
  { key: "statements", href: "/partner/statements", icon: Coins },
] as const

export function PartnerNav() {
  const pathname = usePathname()
  const t = useTranslations("partnerPortal.nav")

  return (
    <nav aria-label={t("label")} className="fixed inset-x-0 bottom-0 z-50 border-t bg-background safe-bottom">
      <div className="mx-auto flex max-w-3xl">
        {items.map(({ key, href, icon: Icon }) => {
          const active = href === "/partner" ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors",
                active ? "font-medium text-kara-purple" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} aria-hidden />
              {t(key)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
