import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

export default async function RootPage() {
  const session = await getSession()
  if (!session) redirect("/login")
  const role = (session.user as { role: string }).role
  if (role === "partner") redirect("/partner/tasks")
  redirect("/admin/dashboard")
}
