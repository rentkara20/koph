"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { LogOut } from "lucide-react"
import { authClient } from "@/lib/auth/client"

export function PartnerLogout() {
  const router = useRouter()
  const t = useTranslations("common")

  async function handleLogout() {
    await authClient.signOut()
    router.push("/login")
  }

  return (
    <button
      onClick={handleLogout}
      aria-label={t("logout")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
    >
      <LogOut className="size-4 rtl:rotate-180" aria-hidden />
    </button>
  )
}
