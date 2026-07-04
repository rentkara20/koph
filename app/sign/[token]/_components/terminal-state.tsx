"use client"

import { useTranslations } from "next-intl"
import { CircleCheck, CircleX, Clock, Ban, FileClock } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { KaraLogo } from "./sign-header"

export type TerminalKind =
  | "signed"
  | "declined"
  | "expired"
  | "alreadySigned"
  | "notActive"
  | "cancelled"

const CONFIG: Record<
  TerminalKind,
  { icon: LucideIcon; tone: "success" | "danger" | "muted"; key: string }
> = {
  signed: { icon: CircleCheck, tone: "success", key: "signed" },
  declined: { icon: CircleX, tone: "danger", key: "declined" },
  expired: { icon: Clock, tone: "muted", key: "expired" },
  alreadySigned: { icon: FileClock, tone: "muted", key: "alreadySigned" },
  notActive: { icon: FileClock, tone: "muted", key: "notActive" },
  cancelled: { icon: Ban, tone: "muted", key: "cancelled" },
}

const TONE: Record<string, string> = {
  success: "bg-kara-blue-soft text-kara-blue",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
}

/** Friendly full-screen terminal state with the KARA logo. */
export function TerminalState({ kind }: { kind: TerminalKind }) {
  const t = useTranslations("signatures.signing")
  const tTrust = useTranslations("trust")
  const { icon: Icon, tone, key } = CONFIG[kind]

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-6 text-center">
      <KaraLogo />
      <div
        className={`flex size-16 items-center justify-center rounded-2xl ${TONE[tone]}`}
      >
        <Icon className="size-8" aria-hidden />
      </div>
      <p className="max-w-sm text-lg font-semibold text-foreground">{t(key)}</p>
      <p className="text-xs text-muted-foreground">{tTrust("poweredBy")}</p>
    </div>
  )
}
