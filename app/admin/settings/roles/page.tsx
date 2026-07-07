import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const CAPABILITIES = [
  { area: "Requests, orders, assets, partners, customers", admin: true, finance: false, viewer: "read-only" },
  { area: "Payment batches (generate, approve, send, mark paid)", admin: true, finance: true, viewer: "read-only" },
  { area: "Settings", admin: true, finance: false, viewer: false },
  { area: "Task sign-off (creates a payment record)", admin: true, finance: true, viewer: false },
] as const

export default function RolesSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Current role capabilities (reference only).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            admin / finance / viewer / partner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y rounded-lg border text-sm">
            {CAPABILITIES.map((row) => {
              const viewer: string = row.viewer === false ? "✗" : row.viewer
              return (
                <div key={row.area} className="grid grid-cols-[1fr_auto] items-center gap-3 p-3">
                  <span>{row.area}</span>
                  <span className="text-xs text-muted-foreground">
                    admin: {row.admin ? "✓" : "✗"} · finance: {row.finance ? "✓" : "✗"} · viewer: {viewer}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Roles are checked in code at every server action (<code>getSessionWithRole</code>), not
            read from a settings table — a role matrix stored as data and a bug in how it&apos;s read
            would silently open up financial or destructive actions. Adding a new role (e.g. a
            dispatcher role scoped to task assignment only) is a scoped code change; ask engineering.
            The <code>partner</code> role is excluded entirely from this admin area and only reaches
            token-scoped pages and its own portal.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
