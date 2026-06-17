/**
 * Creates the first admin user.
 * Run with: npx tsx lib/db/seed-admin.ts <email> <password> <name>
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function seedAdmin() {
  const email = process.argv[2]
  const password = process.argv[3]
  const name = process.argv[4] ?? "Admin"

  if (!email || !password) {
    console.error("Usage: npx tsx lib/db/seed-admin.ts <email> <password> [name]")
    process.exit(1)
  }

  const { auth } = await import("../auth/config")
  const { db } = await import("./index")
  const { users } = await import("./schema")
  const { eq } = await import("drizzle-orm")

  console.log(`Creating user ${email}…`)
  await auth.api.signUpEmail({ body: { email, password, name } })

  console.log("Elevating role to admin…")
  await db.update(users).set({ role: "admin", emailVerified: true }).where(eq(users.email, email))

  console.log("Done. You can now log in as admin.")
}

seedAdmin().catch((e) => {
  console.error(e)
  process.exit(1)
})
