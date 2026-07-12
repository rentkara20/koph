// One-off production backup: dumps schema + all rows as SQL to stdout-file.
import { createClient } from "@libsql/client"
import { config } from "dotenv"
import fs from "node:fs"

config({ path: ".env.production.backup" })

const url = process.env.TURSO_DATABASE_URL?.replace(/"/g, "")
const authToken = process.env.TURSO_AUTH_TOKEN?.replace(/"/g, "")
if (!url || !authToken) throw new Error("missing prod creds")

const db = createClient({ url, authToken })
const out = process.argv[2]
if (!out) throw new Error("usage: node backup-prod.mjs <outfile>")

const esc = (v) => {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number" || typeof v === "bigint") return String(v)
  if (v instanceof ArrayBuffer)
    return `X'${Buffer.from(v).toString("hex")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

const stream = fs.createWriteStream(out)
const master = await db.execute(
  "SELECT name, sql, type FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END"
)
let rowTotal = 0
for (const m of master.rows) {
  stream.write(`${m.sql};\n`)
}
for (const m of master.rows.filter((r) => r.type === "table")) {
  const name = m.name
  if (String(name).startsWith("sqlite_")) continue
  const rows = await db.execute(`SELECT * FROM "${name}"`)
  for (const r of rows.rows) {
    const cols = Object.keys(r)
    stream.write(
      `INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((c) => esc(r[c])).join(",")});\n`
    )
    rowTotal++
  }
  console.log(`${name}: ${rows.rows.length} rows`)
}
stream.end()
console.log(`TOTAL ${rowTotal} rows -> ${out}`)
