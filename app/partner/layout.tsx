import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { PartnerNav } from "@/components/layout/partner-nav"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { PartnerLogout } from "./_components/partner-logout"

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect("/login")
  if (session.user.role !== "partner") redirect("/admin/dashboard")

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-kara-purple">
        <div className="flex h-12 items-center justify-between px-4">
          <Link href="/partner" className="flex items-center">
            <Image
              src="/kara-logo-light.png"
              alt="KARA"
              width={92}
              height={40}
              className="h-6 w-auto"
              priority
            />
          </Link>
          <div className="flex items-center gap-1">
            <LocaleToggle />
            <PartnerLogout />
          </div>
        </div>
      </header>
      <main className="flex-1 pb-20">{children}</main>
      <PartnerNav />
    </div>
  )
}
