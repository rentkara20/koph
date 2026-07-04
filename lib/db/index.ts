import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

const url =
  process.env.TURSO_DATABASE_URL ||
  (process.env.NODE_ENV === "production" ? undefined : "file:local.db")

if (!url) {
  throw new Error("TURSO_DATABASE_URL is required in production")
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
