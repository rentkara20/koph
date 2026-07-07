import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { readBrandingSettingsForAdmin } from "@/lib/actions/settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { BrandingSettingsForm } from "@/components/settings/branding-settings-form"
import { cn } from "@/lib/utils"

export default async function BrandingSettingsPage() {
  const settings = await readBrandingSettingsForAdmin()

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
          <h1 className="text-2xl font-semibold tracking-tight">Branding & Locale</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Default language for new accounts.
          </p>
        </div>
      </div>

      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Locale</CardTitle>
          </CardHeader>
          <CardContent>
            <BrandingSettingsForm initial={settings} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Unauthorized.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Logo & consent text</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The consent text shown on signature screens is already versioned in the database
            (consent_version table) rather than hardcoded — ask engineering to add a new version
            when legal text needs to change. The KARA logo is a brand asset, not a per-tenant
            setting, so it stays a static file.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
