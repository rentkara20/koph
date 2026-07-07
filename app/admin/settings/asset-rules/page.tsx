import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function AssetRulesSettingsPage() {
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
          <h1 className="text-2xl font-semibold tracking-tight">Asset & Inventory Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            What&apos;s configurable here today, and why some things aren&apos;t.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Already configurable elsewhere
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Required delivery photo count (proof-of-delivery) lives under{" "}
            <Link href="/admin/settings/request-tasks" className="underline">
              Request & Task Configuration
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Intentionally code-defined
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Asset statuses (in stock, reserved, assigned, delivered, returned, maintenance, damaged,
            retired, sold, lost) and the transitions between them are a state machine in code
            (<code>lib/domain/asset-status.ts</code>), not a settings list. Every inventory-integrity
            fix from the audit — the double-booking race, orphaned &quot;assigned&quot; units on
            cancellation — depends on that state machine staying exactly as coded. Turning it into
            editable data would reopen the same bugs. There is currently no low-stock alerting
            feature to attach a threshold setting to — flag if that&apos;s wanted and it can be built
            with a real consumer, rather than adding a number nothing reads yet.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
