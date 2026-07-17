import Link from "next/link"
import { Settings2, BookOpen, ClipboardList, Coins, KeyRound, Bell, Palette, Package, Shield, Plug, MessagesSquare, Warehouse } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const SECTIONS = [
  {
    href: "/admin/settings/company-locations",
    icon: Warehouse,
    title: "Company locations",
    description: "Warehouses, offices, contacts, and map links used automatically in courier routes.",
  },
  {
    href: "/admin/settings/message-templates",
    icon: MessagesSquare,
    title: "Message Templates",
    description: "Customize WhatsApp and email wording with a separate professional layout for each channel.",
  },
  {
    href: "/admin/settings/request-tasks",
    icon: ClipboardList,
    title: "Request & Task Configuration",
    description: "Request types, task failure reasons, photo requirements, and link expiry — no code change needed.",
  },
  {
    href: "/admin/settings/services",
    icon: BookOpen,
    title: "Services catalog",
    description: "Manage the checklist services that can be assigned to partner tasks.",
  },
  {
    href: "/admin/settings/pricing-payments",
    icon: Coins,
    title: "Pricing & Payments",
    description: "Business-month timezone rules for partner payment batching.",
  },
  {
    href: "/admin/settings/session-security",
    icon: KeyRound,
    title: "Token & Session Policy",
    description: "Login session info, magic-link expiry, and incident-response sign-out.",
  },
  {
    href: "/admin/settings/notifications",
    icon: Bell,
    title: "Notifications",
    description: "Retention window and the weekly ops digest email.",
  },
  {
    href: "/admin/settings/branding",
    icon: Palette,
    title: "Branding & Locale",
    description: "Default language for new accounts.",
  },
  {
    href: "/admin/settings/asset-rules",
    icon: Package,
    title: "Asset & Inventory Rules",
    description: "What's configurable vs. intentionally fixed in the asset state machine.",
  },
  {
    href: "/admin/settings/roles",
    icon: Shield,
    title: "Roles & Permissions",
    description: "Reference for what each role can do.",
  },
  {
    href: "/admin/settings/integrations",
    icon: Plug,
    title: "Integrations",
    description: "Notion sync pause/resume and other connected systems.",
  },
] as const

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure platform-wide options.
        </p>
      </div>

      <div className="grid gap-3">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Card key={href} className="hover:border-ring transition-colors">
            <CardContent className="p-0">
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-4 p-5 w-full rounded-xl",
                  "hover:bg-muted/30 transition-colors"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                </div>
                <Settings2 className="size-4 text-muted-foreground shrink-0" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
