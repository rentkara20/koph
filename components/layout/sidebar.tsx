"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { visibleNavItems, activeNavKey, NAV_GROUP_ORDER, type NavGroup } from "./nav-items"

export function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname()
  const t = useTranslations("nav")
  const tg = useTranslations("nav.group")
  const navItems = visibleNavItems(role)
  const activeKey = activeNavKey(pathname, role)
  const topItems = navItems.filter((i) => !i.group)

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
          {topItems.map((item) => (
            <NavRow
              key={item.key}
              item={item}
              active={activeKey === item.key}
              label={t(item.key as Parameters<typeof t>[0])}
            />
          ))}
        </ul>

        {NAV_GROUP_ORDER.map((group) => {
          const items = navItems.filter((i) => i.group === group)
          if (items.length === 0) return null
          return (
            <div key={group} className="mt-4">
              <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {tg(group as NavGroup)}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <NavRow
                    key={item.key}
                    item={item}
                    active={activeKey === item.key}
                    label={t(item.key as Parameters<typeof t>[0])}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

function NavRow({
  item,
  active,
  label,
}: {
  item: ReturnType<typeof visibleNavItems>[number]
  active: boolean
  label: string
}) {
  const Icon = item.icon
  return (
    <li>
      <Link
        href={item.href}
        prefetch={item.prefetch}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        {label}
      </Link>
    </li>
  )
}
