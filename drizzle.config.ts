import type { Config } from "drizzle-kit"
import { config } from "dotenv"

config({ path: ".env.local" })

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "turso",
  dbCredentials: {
    // Dev falls back to local SQLite (same as lib/db/index.ts). Production
    // pushes must set TURSO_DATABASE_URL explicitly.
    url: process.env.TURSO_DATABASE_URL || "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
} satisfies Config
