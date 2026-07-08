"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { visibleNavItems } from "./nav-items"

export function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname()
  const t = useTranslations("nav")
  const navItems = visibleNavItems(role)

  return (
    <aside className="hidden h-full w-56 flex-col border-e bg-sidebar lg:flex">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <Image
          src="/kara-logo.png"
          alt="KARA"
          width={92}
          height={40}
          className="h-8 w-auto dark:hidden"
          priority
        />
        <Image
          src="/kara-logo-light.png"
          alt="KARA"
          width={92}
          height={40}
          className="hidden h-8 w-auto dark:block"
          priority
        />
        <span className="text-xs font-medium text-muted-foreground border-s ps-2.5">KOPH</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {navItems.map(({ key, href, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <li key={key}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {t(key as Parameters<typeof t>[0])}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
