import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSessionWithRole } from "@/lib/auth/session"
import { getActiveSessionCount } from "@/lib/actions/session-security"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { SessionSecurityPanel } from "@/components/settings/session-security-panel"
import { cn } from "@/lib/utils"

export default async function SessionSecurityPage() {
  const session = await getSessionWithRole("admin")
  const activeSessionCount = session ? await getActiveSessionCount() : 0

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
          <h1 className="text-2xl font-semibold tracking-tight">Token & Session Policy</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Login sessions and magic-link expiry.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Current policy (code-defined)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Login session length:</span> 7 days, refreshed every 24h of activity</p>
          <p><span className="text-muted-foreground">Minimum password length:</span> 10 characters</p>
          <p className="text-xs text-muted-foreground pt-2">
            These stay in code rather than Settings: better-auth builds this config once when the
            server starts, so a bad value here could silently weaken login security until the next
            deploy catches it. Contact engineering to change these.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Magic-link expiry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Task and partner-activation link expiry are configurable under{" "}
            <Link href="/admin/settings/request-tasks" className="underline">
              Request & Task Configuration
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {session && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Security incident response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SessionSecurityPanel activeSessionCount={activeSessionCount} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
