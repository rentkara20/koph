import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

// Fail fast only on deployed production (VERCEL). Local `next build` runs with
// NODE_ENV=production but must work against the dev SQLite file.
const url =
  process.env.TURSO_DATABASE_URL ||
  (process.env.VERCEL ? undefined : "file:local.db")

if (!url) {
  throw new Error("TURSO_DATABASE_URL is required in production")
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
