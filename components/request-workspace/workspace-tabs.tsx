import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { cn } from "@/lib/utils"

export const WORKSPACE_TABS = [
  "overview",
  "buying",
  "devices",
  "jobs",
  "documents",
  "money",
  "timeline",
] as const

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

export function resolveTab(raw: string | undefined): WorkspaceTab {
  return (WORKSPACE_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as WorkspaceTab)
    : "overview"
}

// URL-driven tab bar (?tab=…): shareable, server-rendered, no client state.
// Horizontally scrollable on mobile.
export async function WorkspaceTabBar({
  orderId,
  active,
  counts,
}: {
  orderId: string
  active: WorkspaceTab
  counts: Partial<Record<WorkspaceTab, number>>
}) {
  const t = await getTranslations("workspace.tabs")

  return (
    <nav
      className="-mx-4 overflow-x-auto border-b px-4 sm:-mx-6 sm:px-6"
      aria-label={t("label")}
    >
      <ul className="flex w-max min-w-full gap-1">
        {WORKSPACE_TABS.map((tab) => {
          const isActive = tab === active
          const count = counts[tab]
          return (
            <li key={tab}>
              <Link
                href={`/admin/orders/${orderId}?tab=${tab}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {t(tab)}
                {count != null && count > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
