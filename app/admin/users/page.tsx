import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getSessionWithPermission } from "@/lib/auth/session"
import { listUsers, getUnlinkedPartners } from "@/lib/actions/users"
import { UsersManager } from "./_components/users-manager"

export default async function UsersPage() {
  // Admin-only: the /admin layout lets finance/viewer through, so this
  // security-sensitive page self-guards on the users.read permission.
  const session = await getSessionWithPermission("users.read")
  if (!session) redirect("/admin/dashboard")

  const [t, users, partners, currentUserId] = await Promise.all([
    getTranslations("users"),
    listUsers(),
    getUnlinkedPartners(),
    Promise.resolve(session.user.id),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
      </div>
      <UsersManager
        initialUsers={users}
        unlinkedPartners={partners}
        currentUserId={currentUserId}
      />
    </div>
  )
}
