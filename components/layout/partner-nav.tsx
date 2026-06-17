"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { ClipboardList, User } from "lucide-react"

const items = [
  { key: "tasks", href: "/partner/tasks", icon: ClipboardList },
  { key: "profile", href: "/partner/profile", icon: User },
] as const

export function PartnerNav() {
  const pathname = usePathname()
  const t = useTranslations("nav")

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background safe-bottom">
      <div className="flex">
        {items.map(({ key, href, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              {t(key as "tasks")}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
