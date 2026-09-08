// DEMO-ONLY: builds a throwaway demo.db from migrations and seeds just enough
// to walk the sticker flow end to end. Never point this at prod.
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { rmSync } from "node:fs"

const FILE = "demo.db"
for (const suffix of ["", "-shm", "-wal"]) {
  try { rmSync(FILE + suffix) } catch { /* fresh run */ }
}

const client = createClient({ url: `file:${FILE}` })
const db = drizzle(client, { schema })
await migrate(client, { migrationsFolder: "./lib/db/migrations" })

const ADMIN = createId()
await db.insert(schema.users).values({
  id: ADMIN, name: "Demo Admin", email: "demo@kara.local", role: "admin",
})

// Real serials from order 10693 (JeelPay), so the demo exercises real data
// shapes: an existing asset that the upload must flag as a clash, plus units
// with and without a recorded model.
const units: Array<[string, string | null, string | null]> = [
  ["HK56KK4N66", "Apple", "iPad Pro 3rd Gen, 11-inch, Storage 128GB"],
  ["GG7G5JLTQ16Q", "Apple", "iPad Air 4th Gen, Wifi, Storage 64GB"],
  ["FMQWX024NW", null, null],
  ["359345643190859", "Apple", "iPhone 13, Storage 128GB"],
]
await db.insert(schema.orderUnits).values(
  units.map(([serial, brand, model]) => ({
    id: createId(),
    serialNumber: serial,
    brand,
    model,
    deviceType: brand ? "Tablet" : null,
    kind: "rental",
    status: "delivered",
  }))
)

console.log(`demo.db ready — admin demo@kara.local, ${units.length} assets seeded`)
console.log(`ADMIN_ID=${ADMIN}`)
