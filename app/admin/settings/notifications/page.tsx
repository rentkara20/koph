import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { readNotificationSettingsForAdmin } from "@/lib/actions/settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { NotificationSettingsForm } from "@/components/settings/notification-settings-form"
import { cn } from "@/lib/utils"

export default async function NotificationSettingsPage() {
  const settings = await readNotificationSettingsForAdmin()

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
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Retention and weekly digest email.
          </p>
        </div>
      </div>

      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In-app notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationSettingsForm initial={settings} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Unauthorized.</p>
      )}
    </div>
  )
}
