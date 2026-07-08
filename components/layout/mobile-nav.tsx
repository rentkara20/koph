"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet } from "@/components/ui/sheet"
import { visibleNavItems } from "./nav-items"

export function MobileNav({ role }: { role?: string }) {
  const pathname = usePathname()
  const t = useTranslations("nav")
  const [open, setOpen] = useState(false)
  const navItems = visibleNavItems(role)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        className="flex size-10 items-center justify-center rounded-md text-foreground hover:bg-accent lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("menu")}>
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <Image
            src="/kara-logo.png"
            alt="KARA"
            width={92}
            height={40}
            className="h-8 w-auto dark:hidden"
          />
          <Image
            src="/kara-logo-light.png"
            alt="KARA"
            width={92}
            height={40}
            className="hidden h-8 w-auto dark:block"
          />
          <span className="text-xs font-medium text-muted-foreground border-s ps-2.5">KOPH</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {navItems.map(({ key, href, icon: Icon, prefetch }) => {
              const active = pathname.startsWith(href)
              return (
                <li key={key}>
                  <Link
                    href={href}
                    prefetch={prefetch}
                    onClick={() => setOpen(false)}
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
