import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { readIntegrationSettingsForAdmin } from "@/lib/actions/settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { IntegrationSettingsForm } from "@/components/settings/integration-settings-form"
import { cn } from "@/lib/utils"

export default async function IntegrationSettingsPage() {
  const settings = await readIntegrationSettingsForAdmin()

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
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            External systems connected to KOPH.
          </p>
        </div>
      </div>

      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Notion</CardTitle>
          </CardHeader>
          <CardContent>
            <IntegrationSettingsForm initial={settings} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Unauthorized.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Other integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            WhatsApp task/signing links use wa.me deep links (no API keys, nothing to configure).
            Resend (email) and Vercel Blob (file storage) are configured via environment variables
            only, since they hold live credentials that shouldn&apos;t live in an app-editable table.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
