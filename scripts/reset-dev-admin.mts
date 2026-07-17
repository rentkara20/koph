// DEV-ONLY: reset a local admin's password using better-auth's own hasher.
// Runs against local.db (via .env.local). Never point this at prod.
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, accounts } from "@/lib/db/schema"
import { auth } from "@/lib/auth/config"

const EMAIL = process.argv[2] ?? "dev-admin@kara.local"
const PASSWORD = process.argv[3] ?? "DevAdmin2026!"

const [user] = await db.select().from(users).where(eq(users.email, EMAIL))
if (!user) throw new Error(`No user ${EMAIL} on this DB`)

const ctx = await auth.$context
const hash = await ctx.password.hash(PASSWORD)

const res = await db
  .update(accounts)
  .set({ password: hash })
  .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))

console.log(`Reset password for ${EMAIL} (role=${user.role}). rowsAffected=${(res as { rowsAffected?: number }).rowsAffected}`)
console.log(`Login: ${EMAIL} / ${PASSWORD}`)
