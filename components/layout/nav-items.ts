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
  Handshake,
  Inbox,
  PackageCheck,
} from "lucide-react"

/** Sidebar groups, in render order. Keys map to nav.group.* i18n labels. */
export type NavGroup = "work" | "devices" | "supply" | "people" | "money" | "system"

export const NAV_GROUP_ORDER: readonly NavGroup[] = [
  "work",
  "devices",
  "supply",
  "people",
  "money",
  "system",
] as const

export type NavItem = {
  key: string
  href: string
  icon: typeof LayoutDashboard
  /** Group this item renders under. Omitted = ungrouped, pinned to the top (Home). */
  group?: NavGroup
  adminOnly?: boolean
  /**
   * Set false to disable Next.js Link auto-prefetch for this item. The
   * sidebar renders every item at once, so by default all routes prefetch
   * concurrently on mount. A freshly-deployed, not-yet-warm route racing that
   * prefetch against a real click has been observed to trigger a React
   * "$RS ... parentNode" crash in production. Opt heavy/new routes out until
   * confirmed fixed upstream.
   */
  prefetch?: boolean
}

// Recentred on the Customer Request: "orders" is the Request workspace (label
// "Requests"), "requests" is field work (label "Jobs"). Routes are unchanged so
// existing deep links keep resolving; only the visible labels and grouping move.
export const navItems: readonly NavItem[] = [
  { key: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },

  { key: "orders", href: "/admin/orders", icon: ClipboardList, group: "work" },
  { key: "requests", href: "/admin/requests", icon: PackageSearch, group: "work" },

  { key: "assets", href: "/admin/assets", icon: Laptop, group: "devices" },
  { key: "maintenance", href: "/admin/maintenance", icon: Wrench, group: "devices" },
  { key: "warranty", href: "/admin/warranty", icon: BadgeCheck, group: "devices", prefetch: false },
  { key: "accessories", href: "/admin/accessories", icon: Cable, group: "devices", prefetch: false },

  { key: "sourcing", href: "/admin/sourcing", icon: Handshake, group: "supply", prefetch: false },
  { key: "procurement", href: "/admin/procurement", icon: PackagePlus, group: "supply", prefetch: false },
  { key: "receiving", href: "/admin/procurement/receiving", icon: PackageCheck, group: "supply", prefetch: false },

  { key: "customers", href: "/admin/customers", icon: Users, group: "people" },
  { key: "suppliers", href: "/admin/suppliers", icon: Store, group: "people" },
  { key: "partners", href: "/admin/partners", icon: Truck, group: "people" },

  { key: "payments", href: "/admin/payments", icon: Coins, group: "money" },
  { key: "reports", href: "/admin/reports", icon: BarChart3, group: "money" },

  { key: "signatures", href: "/admin/signatures", icon: FileSignature, group: "system" },
  { key: "users", href: "/admin/users", icon: ShieldCheck, group: "system", adminOnly: true, prefetch: false },
  { key: "settings", href: "/admin/settings", icon: Settings, group: "system" },
] as const

/** Nav items visible to a given role — hides admin-only entries from non-admins. */
export function visibleNavItems(role?: string): readonly NavItem[] {
  return navItems.filter((i) => !i.adminOnly || role === "admin")
}

/**
 * The active nav item for a path: the one whose href is the longest prefix of
 * the current pathname. Longest-match avoids a parent (e.g. /admin/procurement)
 * lighting up while on a more specific child (/admin/procurement/receiving).
 */
export function activeNavKey(pathname: string, role?: string): string | undefined {
  let best: NavItem | undefined
  for (const item of visibleNavItems(role)) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item
    }
  }
  return best?.key
}

// The 4 most-used sections, surfaced in the mobile bottom nav (5th slot is
// the "more" drawer trigger, wired up in bottom-nav.tsx). orders=Requests,
// requests=Jobs after the recentre.
export const BOTTOM_NAV_KEYS = ["dashboard", "orders", "requests", "assets"] as const
