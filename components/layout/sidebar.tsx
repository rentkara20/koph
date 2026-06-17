"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Truck,
  FileSignature,
  Coins,
  BarChart3,
  Settings,
  Building2,
} from "lucide-react"

const navItems = [
  { key: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { key: "requests", href: "/admin/requests", icon: ClipboardList },
  { key: "customers", href: "/admin/customers", icon: Users },
  { key: "partners", href: "/admin/partners", icon: Truck },
  { key: "signatures", href: "/admin/signatures", icon: FileSignature },
  { key: "payments", href: "/admin/payments", icon: Coins },
  { key: "reports", href: "/admin/reports", icon: BarChart3 },
  { key: "settings", href: "/admin/settings", icon: Settings },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const t = useTranslations("nav")

  return (
    <aside className="flex h-full w-56 flex-col border-e bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Building2 className="h-5 w-5 text-foreground" />
        <span className="font-semibold tracking-tight">KOPH</span>
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
