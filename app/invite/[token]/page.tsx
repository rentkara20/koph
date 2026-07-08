import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { getInviteByToken } from "@/lib/actions/user-invites"
import { InviteForm } from "./_components/invite-form"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [info, t] = await Promise.all([getInviteByToken(token), getTranslations("invite")])

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex justify-center">
          <Image src="/kara-logo.png" alt="KARA" width={130} height={57} className="h-12 w-auto dark:hidden" priority />
          <Image src="/kara-logo-light.png" alt="KARA" width={130} height={57} className="hidden h-12 w-auto dark:block" priority />
        </div>
        {info?.valid ? (
          <InviteForm token={token} name={info.name} email={info.email} isReset={info.isReset} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">{t("invalid")}</p>
        )}
      </div>
    </div>
  )
}
