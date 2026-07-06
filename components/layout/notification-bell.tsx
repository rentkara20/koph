"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Bell } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from "@/lib/actions/notifications"
import { formatDateTime } from "@/lib/utils/format"

const POLL_MS = 60_000

export function NotificationBell() {
  const t = useTranslations("notifications")
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])

  const load = useCallback(async () => {
    const rows = await getMyNotifications()
    setItems(rows)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const unread = items.filter((n) => !n.readAt).length

  async function handleOpen(item: NotificationItem) {
    if (!item.readAt) {
      await markNotificationRead(item.id)
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: Date.now() } : n)))
    }
    if (item.linkUrl) router.push(item.linkUrl)
  }

  async function handleMarkAll() {
    await markAllNotificationsRead()
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })))
  }

  // Dynamic key + interpolation; fall back to the raw type if a key/placeholder
  // is missing so one bad row never crashes the whole bell.
  function label(item: NotificationItem): string {
    const key = item.i18nKey.replace(/^notifications\./, "")
    try {
      return t(key as never, (item.i18nData ?? {}) as never)
    } catch {
      return item.type
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread > 0 ? t("titleWithUnread", { count: unread }) : t("title")}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full outline-none text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-sm font-medium">{t("title")}</p>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("markAllRead")}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">{t("empty")}</div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => handleOpen(item)}
                className="flex flex-col items-start gap-0.5 whitespace-normal"
              >
                <span className={item.readAt ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
                  {label(item)}
                </span>
                <span className="text-[11px] text-muted-foreground/60">
                  {formatDateTime(item.createdAt)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
