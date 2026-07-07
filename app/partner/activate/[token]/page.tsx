import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { getPartnerByActivationToken } from "@/lib/actions/partners"
import { ActivationForm } from "./_components/activation-form"

export default async function PartnerActivatePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [partner, t] = await Promise.all([
    getPartnerByActivationToken(token),
    getTranslations("partners.activation"),
  ])

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex justify-center">
          <Image src="/kara-logo.png" alt="KARA" width={130} height={57} className="h-12 w-auto dark:hidden" priority />
          <Image src="/kara-logo-light.png" alt="KARA" width={130} height={57} className="hidden h-12 w-auto dark:block" priority />
        </div>
        {partner ? (
          <ActivationForm token={token} partnerName={partner.name} defaultEmail={partner.email ?? ""} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">{t("expired")}</p>
        )}
      </div>
    </div>
  )
}
