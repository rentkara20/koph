import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { createAndAssignRequestReceiverCore } from "./requests"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "request-receiver-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("createAndAssignRequestReceiverCore", () => {
  it("creates an employee for the request customer and selects them as receiver atomically", async () => {
    const customerId = createId()
    const typeId = createId()
    const requestId = createId()

    await db.insert(schema.customers).values({ id: customerId, name: "Customer" })
    await db.insert(schema.requestTypes).values({
      id: typeId,
      slug: "delivery",
      nameEn: "Delivery",
      nameAr: "توصيل",
    })
    await db.insert(schema.requests).values({
      id: requestId,
      requestNumber: "REQ-RECEIVER-1",
      trackingCode: "TRACK-RECEIVER-1",
      typeId,
      customerId,
    })

    const contact = await db.transaction((tx) =>
      createAndAssignRequestReceiverCore(tx, requestId, {
        name: "Ahmed Ali",
        role: "Warehouse receiver",
        mobile: "0500000000",
      })
    )

    const [savedRequest] = await db
      .select()
      .from(schema.requests)
      .where(eq(schema.requests.id, requestId))
    const [savedContact] = await db
      .select()
      .from(schema.customerContacts)
      .where(eq(schema.customerContacts.id, contact.id))

    expect(savedContact).toMatchObject({
      customerId,
      name: "Ahmed Ali",
      role: "Warehouse receiver",
      mobile: "0500000000",
    })
    expect(savedRequest.receiverContactId).toBe(contact.id)
  })
})
