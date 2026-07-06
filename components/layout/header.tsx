"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Search } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LanguageSwitcher } from "./language-switcher"
import { NotificationBell } from "./notification-bell"
import { authClient } from "@/lib/auth/client"
import { useRouter } from "next/navigation"

interface HeaderProps {
  userName: string
  userRole: string
}

export function Header({ userName, userRole }: HeaderProps) {
  const t = useTranslations("nav")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [query, setQuery] = useState("")
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  async function handleLogout() {
    await authClient.signOut()
    router.push("/login")
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length >= 2) {
      router.push(`/admin/search?q=${encodeURIComponent(q)}`)
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <form onSubmit={handleSearch} className="flex items-center gap-1.5 flex-1 max-w-xs">
        <Search className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
        <label htmlFor="admin-search" className="sr-only">
          {tCommon("search")}
        </label>
        <input
          id="admin-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tCommon("search") + "…"}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </form>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-full outline-none hover:ring-2 hover:ring-ring hover:ring-offset-1">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium leading-none">{userName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground capitalize">{userRole}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
