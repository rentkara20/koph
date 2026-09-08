// DEMO-ONLY: gives the demo admin a credential login on demo.db.
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, accounts } from "@/lib/db/schema"
import { auth } from "@/lib/auth/config"
import { createId } from "@/lib/utils/ids"

const EMAIL = "demo@kara.local"
const PASSWORD = "DemoKara2026!"

const [user] = await db.select().from(users).where(eq(users.email, EMAIL))
if (!user) throw new Error("seed demo.db first")

const ctx = await auth.$context
const password = await ctx.password.hash(PASSWORD)

const existing = await db.select().from(accounts).where(eq(accounts.userId, user.id))
if (existing.length === 0) {
  await db.insert(accounts).values({
    id: createId(),
    accountId: user.id,
    providerId: "credential",
    userId: user.id,
    password,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  console.log("created credential account")
} else {
  await db.update(accounts).set({ password }).where(eq(accounts.userId, user.id))
  console.log("updated credential account")
}
console.log(`Login: ${EMAIL} / ${PASSWORD}`)
