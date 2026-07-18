import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Client } from "@libsql/client"

type MigrationJournal = { entries: { tag: string }[] }

// Drop-in replacement for drizzle-orm/libsql/migrator's migrate(), for
// ephemeral test databases only. @libsql/client's client.migrate() batch
// fast-path (what drizzle-orm's migrator calls internally) cannot parse
// functional-expression indexes — e.g. order_unit_serial_idx's
// `lower(trim(serial_number))` — and throws "no such column:
// lower(trim(...))" even though the identical DDL applies fine via plain
// client.execute() or the sqlite3 CLI. Applying each statement individually
// sidesteps the batch parser bug.
export async function migrate(client: Client, config: { migrationsFolder: string }): Promise<void> {
  const journalPath = join(config.migrationsFolder, "meta/_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as MigrationJournal
  for (const entry of journal.entries) {
    const sql = readFileSync(join(config.migrationsFolder, `${entry.tag}.sql`), "utf-8")
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim()
      if (trimmed) await client.execute(trimmed)
    }
  }
}
