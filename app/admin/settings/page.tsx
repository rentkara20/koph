import Link from "next/link"
import { Settings2, BookOpen } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const SECTIONS = [
  {
    href: "/admin/settings/services",
    icon: BookOpen,
    title: "Services catalog",
    description: "Manage the checklist services that can be assigned to partner tasks.",
  },
] as const

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
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
