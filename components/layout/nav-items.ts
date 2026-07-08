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
} from "lucide-react"

export type NavItem = {
  key: string
  href: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}

export const navItems: readonly NavItem[] = [
  { key: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { key: "orders", href: "/admin/orders", icon: PackageSearch },
  { key: "assets", href: "/admin/assets", icon: Laptop },
  { key: "maintenance", href: "/admin/maintenance", icon: Wrench },
  { key: "requests", href: "/admin/requests", icon: ClipboardList },
  { key: "customers", href: "/admin/customers", icon: Users },
  { key: "suppliers", href: "/admin/suppliers", icon: Store },
  { key: "partners", href: "/admin/partners", icon: Truck },
  { key: "signatures", href: "/admin/signatures", icon: FileSignature },
  { key: "payments", href: "/admin/payments", icon: Coins },
  { key: "reports", href: "/admin/reports", icon: BarChart3 },
  { key: "users", href: "/admin/users", icon: ShieldCheck, adminOnly: true },
  { key: "settings", href: "/admin/settings", icon: Settings },
] as const

/** Nav items visible to a given role — hides admin-only entries from non-admins. */
export function visibleNavItems(role?: string): readonly NavItem[] {
  return navItems.filter((i) => !i.adminOnly || role === "admin")
}

// The 4 most-used sections, surfaced in the mobile bottom nav (5th slot is
// the "more" drawer trigger, wired up in bottom-nav.tsx).
export const BOTTOM_NAV_KEYS = ["dashboard", "requests", "orders", "assets"] as const
