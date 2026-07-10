import {
  Laptop,
  LayoutDashboard,
  ClipboardList,
  PackageSearch,
  Users,
  Truck,
  Store,
  FileSignature,
  Coins,
  BarChart3,
  Settings,
  Wrench,
  ShieldCheck,
  PackagePlus,
  BadgeCheck,
  Cable,
} from "lucide-react"

export type NavItem = {
  key: string
  href: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  /**
   * Set false to disable Next.js Link auto-prefetch for this item. The
   * sidebar renders every item at once, so by default all ~13 routes
   * prefetch concurrently on mount. A freshly-deployed, not-yet-warm route
   * racing that prefetch against a real click has been observed to trigger
   * a React "$RS ... parentNode" crash in production (Next.js App Router
   * prefetch/Suspense-swap race, not reproducible locally where responses
   * are near-instant). Opt heavy/new routes out until this is confirmed
   * fixed upstream.
   */
  prefetch?: boolean
}

export const navItems: readonly NavItem[] = [
  { key: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { key: "orders", href: "/admin/orders", icon: PackageSearch },
  { key: "assets", href: "/admin/assets", icon: Laptop },
  { key: "procurement", href: "/admin/procurement", icon: PackagePlus, prefetch: false },
  { key: "warranty", href: "/admin/warranty", icon: BadgeCheck, prefetch: false },
  { key: "accessories", href: "/admin/accessories", icon: Cable, prefetch: false },
  { key: "maintenance", href: "/admin/maintenance", icon: Wrench },
  { key: "requests", href: "/admin/requests", icon: ClipboardList },
  { key: "customers", href: "/admin/customers", icon: Users },
  { key: "suppliers", href: "/admin/suppliers", icon: Store },
  { key: "partners", href: "/admin/partners", icon: Truck },
  { key: "signatures", href: "/admin/signatures", icon: FileSignature },
  { key: "payments", href: "/admin/payments", icon: Coins },
  { key: "reports", href: "/admin/reports", icon: BarChart3 },
  { key: "users", href: "/admin/users", icon: ShieldCheck, adminOnly: true, prefetch: false },
  { key: "settings", href: "/admin/settings", icon: Settings },
] as const

/** Nav items visible to a given role — hides admin-only entries from non-admins. */
export function visibleNavItems(role?: string): readonly NavItem[] {
  return navItems.filter((i) => !i.adminOnly || role === "admin")
}

// The 4 most-used sections, surfaced in the mobile bottom nav (5th slot is
// the "more" drawer trigger, wired up in bottom-nav.tsx).
export const BOTTOM_NAV_KEYS = ["dashboard", "requests", "orders", "assets"] as const
