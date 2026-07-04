import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { LocaleToggle } from "./locale-toggle"

const LOGO_RATIO = 558 / 244

type StatusVariant = "outline" | "info" | "success" | "secondary"

function KaraLogo({ className }: { className?: string }) {
  const height = 24
  const width = Math.round(height * LOGO_RATIO)
  return (
    <div className={className} style={{ width, height }}>
      <Image
        src="/kara-logo.png"
        alt="KARA"
        width={558}
        height={244}
        priority
        className="block h-full w-full object-contain dark:hidden"
      />
      <Image
        src="/kara-logo-light.png"
        alt="KARA"
        width={558}
        height={244}
        priority
        className="hidden h-full w-full object-contain dark:block"
      />
    </div>
  )
}

/** Sticky brand header for the signing page. */
export function SignHeader({
  documentName,
  subtitle,
  statusLabel,
  statusVariant,
}: {
  documentName: string
  subtitle?: string | null
  statusLabel: string
  statusVariant: StatusVariant
}) {
  return (
    <header className="sticky top-0 z-10 bg-kara-purple text-primary-foreground shadow-sm">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <KaraLogo className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{documentName}</p>
          {subtitle && (
            <p className="truncate text-xs text-primary-foreground/70">{subtitle}</p>
          )}
        </div>
        <Badge variant={statusVariant} className="shrink-0">
          {statusLabel}
        </Badge>
        <LocaleToggle />
      </div>
    </header>
  )
}

export { KaraLogo }
