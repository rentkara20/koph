import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { PartnerNav } from "@/components/layout/partner-nav"

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <main className="flex-1 pb-20">{children}</main>
      <PartnerNav />
    </div>
  )
}
