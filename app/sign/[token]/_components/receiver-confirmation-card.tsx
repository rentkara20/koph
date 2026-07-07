import { useTranslations } from "next-intl"
import { ShieldCheck } from "lucide-react"
import { formatDate } from "@/lib/utils/format"

type Props = {
  fullName: string
  nationalId: string | null
  signedAt: number
  signatureData: string
}

// Shown to the authorised signatory before they sign: proof of who actually
// received the delivery and when, so the co-signature is an informed one.
export function ReceiverConfirmationCard({ fullName, nationalId, signedAt, signatureData }: Props) {
  const t = useTranslations("signatures.signing")

  return (
    <section className="overflow-hidden rounded-xl border border-kara-purple/20 bg-kara-purple-soft/40">
      <header className="flex items-center gap-2 bg-kara-purple/10 px-5 py-3">
        <ShieldCheck className="size-4 text-kara-purple" aria-hidden />
        <h2 className="text-sm font-semibold text-kara-purple">{t("receiverConfirmedTitle")}</h2>
      </header>
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex-1 min-w-[10rem] space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">{t("fullName")}: </span>
            <strong className="text-foreground">{fullName}</strong>
          </p>
          {nationalId && (
            <p>
              <span className="text-muted-foreground">{t("nationalId")}: </span>
              <strong className="font-mono text-foreground">{nationalId}</strong>
            </p>
          )}
          <p>
            <span className="text-muted-foreground">{t("receiverSignedAtLabel")}: </span>
            <strong className="text-foreground">{formatDate(signedAt)}</strong>
          </p>
        </div>
        <div className="shrink-0 rounded-lg border border-border bg-card px-3 py-2">
          <img src={signatureData} alt={t("receiverSignedAtLabel")} className="h-14 w-auto" />
        </div>
      </div>
    </section>
  )
}
