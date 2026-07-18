import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getSessionWithRole } from "@/lib/auth/session"
import { getActiveSessionCount } from "@/lib/actions/session-security"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { SessionSecurityPanel } from "@/components/settings/session-security-panel"
import { cn } from "@/lib/utils"

export default async function SessionSecurityPage() {
  const session = await getSessionWithRole("admin")
  const [activeSessionCount, t] = await Promise.all([
    session ? getActiveSessionCount() : Promise.resolve(0),
    getTranslations("sessionSecurityPage"),
  ])

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
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("currentPolicyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t("sessionLengthLabel")}</span>{" "}
            {t("sessionLengthValue")}
          </p>
          <p>
            <span className="text-muted-foreground">{t("minPasswordLabel")}</span>{" "}
            {t("minPasswordValue")}
          </p>
          <p className="text-xs text-muted-foreground pt-2">{t("policyNote")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("magicLinkTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t.rich("magicLinkBody", {
              link: (chunks) => (
                <Link href="/admin/settings/request-tasks" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </CardContent>
      </Card>

      {session && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("incidentResponseTitle")}
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
