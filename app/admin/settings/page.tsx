import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Settings2, BookOpen, ClipboardList, Coins, KeyRound, Bell, Palette, Package, Shield, Plug, MessagesSquare, Warehouse, ShieldCheck, FileSpreadsheet } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const GROUPS = [
  {
    groupKey: "work",
    sections: [
      {
        href: "/admin/settings/request-tasks",
        icon: ClipboardList,
        titleKey: "requestTasksTitle",
        descKey: "requestTasksDesc",
      },
      {
        href: "/admin/settings/services",
        icon: BookOpen,
        titleKey: "servicesTitle",
        descKey: "servicesDesc",
      },
    ],
  },
  {
    groupKey: "devices",
    sections: [
      {
        href: "/admin/settings/asset-rules",
        icon: Package,
        titleKey: "assetRulesTitle",
        descKey: "assetRulesDesc",
      },
      {
        href: "/admin/settings/warranty",
        icon: ShieldCheck,
        titleKey: "warrantyConfigTitle",
        descKey: "warrantyConfigDesc",
      },
    ],
  },
  {
    groupKey: "money",
    sections: [
      {
        href: "/admin/settings/pricing-payments",
        icon: Coins,
        titleKey: "pricingPaymentsTitle",
        descKey: "pricingPaymentsDesc",
      },
    ],
  },
  {
    groupKey: "people",
    sections: [
      {
        href: "/admin/settings/roles",
        icon: Shield,
        titleKey: "rolesTitle",
        descKey: "rolesDesc",
      },
      {
        href: "/admin/settings/session-security",
        icon: KeyRound,
        titleKey: "sessionSecurityTitle",
        descKey: "sessionSecurityDesc",
      },
    ],
  },
  {
    groupKey: "system",
    sections: [
      {
        href: "/admin/settings/company-locations",
        icon: Warehouse,
        titleKey: "companyLocationsTitle",
        descKey: "companyLocationsDesc",
      },
      {
        href: "/admin/settings/message-templates",
        icon: MessagesSquare,
        titleKey: "messageTemplatesTitle",
        descKey: "messageTemplatesDesc",
      },
      {
        href: "/admin/settings/notifications",
        icon: Bell,
        titleKey: "notificationsTitle",
        descKey: "notificationsDesc",
      },
      {
        href: "/admin/settings/branding",
        icon: Palette,
        titleKey: "brandingTitle",
        descKey: "brandingDesc",
      },
      {
        href: "/admin/settings/integrations",
        icon: Plug,
        titleKey: "integrationsTitle",
        descKey: "integrationsDesc",
      },
    ],
  },
] as const

export default async function SettingsPage() {
  const [t, tImportExport, tNav] = await Promise.all([
    getTranslations("settingsIndex"),
    getTranslations("importExport"),
    getTranslations("nav"),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
      </div>

      {GROUPS.map(({ groupKey, sections }) => (
        <div key={groupKey} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tNav(`group.${groupKey}`)}
          </h2>
          <div className="grid gap-3">
            {sections.map(({ href, icon: Icon, titleKey, descKey }) => (
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
                      <p className="font-medium">{t(titleKey)}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{t(descKey)}</p>
                    </div>
                    <Settings2 className="size-4 text-muted-foreground shrink-0" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {tImportExport("linkLabel")}
        </h2>
        <Card className="hover:border-ring transition-colors">
          <CardContent className="p-0">
            <Link
              href="/admin/settings/import-export"
              className={cn(
                "flex items-center gap-4 p-5 w-full rounded-xl",
                "hover:bg-muted/30 transition-colors"
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                <FileSpreadsheet className="size-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{tImportExport("pageTitle")}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {tImportExport("pageSubtitle")}
                </p>
              </div>
              <Settings2 className="size-4 text-muted-foreground shrink-0" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
