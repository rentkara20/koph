import { headers } from "next/headers"
import { auth } from "./config"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")
  return session
}

export async function requireRole(
  ...roles: Array<"admin" | "finance" | "viewer" | "partner">
) {
  const session = await requireSession()
  if (!roles.includes(session.user.role as never)) {
    throw new Error("Forbidden")
  }
  return session
}
