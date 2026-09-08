// The label studio deliberately does NOT share a table with inventory, but it
// DOES share a database — so a serial that already exists as a real asset is
// caught as a clash instead of quietly becoming a second QR code for one
// device. Both halves of that bargain are asserted here.
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"

const ADMIN_ID = "admin-label-studio"

const holder = vi.hoisted(() => ({ db: null as unknown }))
const staff = vi.hoisted(() => ({ session: null as unknown }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["user-agent", "vitest"]])),
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, delete: () => {} })),
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionWithRole: vi.fn(async () => staff.session),
  getStaffSession: vi.fn(async () => staff.session),
}))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import {
  getLabelBatch,
  listLabelBatches,
  markLabelsPrinted,
  registerLabelBatch,
  validateLabelUpload,
} from "./label-studio"
import { getDevicePublicView } from "./device-portal"

const CSV = (...lines: string[]) => ["Serial,Brand,Model", ...lines].join("\n")

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "label-studio-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({
    id: ADMIN_ID,
    name: "Admin",
    email: "admin@label-studio.local",
    role: "admin",
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

beforeEach(async () => {
  staff.session = { user: { id: ADMIN_ID } }
  await db.delete(schema.labelDevices)
  await db.delete(schema.labelBatches)
  await db.delete(schema.orderUnits)
})

describe("upload validation", () => {
  test("staff-only", async () => {
    staff.session = null
    expect(await validateLabelUpload(CSV("AAA111,Apple,iPad"))).toEqual({ error: "forbidden" })
  })

  test("a file with no serial column is refused, not half-imported", async () => {
    expect(await validateLabelUpload("Name,Price\nfoo,10")).toEqual({ error: "no_serial_column" })
  })

  test("an empty file is refused", async () => {
    expect(await validateLabelUpload("   ")).toEqual({ error: "empty_file" })
  })

  test("validation writes nothing — it is a dry run", async () => {
    await validateLabelUpload(CSV("AAA111,Apple,iPad", "BBB222,Apple,iPad"))
    expect(await db.select().from(schema.labelDevices)).toHaveLength(0)
    expect(await db.select().from(schema.labelBatches)).toHaveLength(0)
  })

  test("a serial that is already a KOPH asset is flagged", async () => {
    await db.insert(schema.orderUnits).values({
      id: "unit-existing",
      serialNumber: "HK56-KK4N-66",
      kind: "rental",
      status: "delivered",
    })

    const result = await validateLabelUpload(CSV("HK56KK4N66,Apple,iPad", "NEW999,Apple,iPad"))
    if ("error" in result) throw new Error(result.error)

    expect(result.rows[0].issues).toContain("already_exists")
    expect(result.rows[1].issues).toEqual([])
    expect(result).toMatchObject({ printable: 1, blocked: 1 })
  })

  test("a serial from an earlier batch is flagged too", async () => {
    await registerLabelBatch({
      name: "first",
      devices: [{ serialNumber: "AAA111" }],
    })

    const result = await validateLabelUpload(CSV("AAA111,Apple,iPad"))
    if ("error" in result) throw new Error(result.error)
    expect(result.rows[0].issues).toContain("already_exists")
  })
})

describe("registering a batch", () => {
  test("only an admin may register", async () => {
    staff.session = null
    expect(await registerLabelBatch({ name: "x", devices: [{ serialNumber: "AAA111" }] })).toEqual({
      error: "forbidden",
    })
  })

  test("stores the devices and freezes the printed URL prefix on the batch", async () => {
    const result = await registerLabelBatch({
      name: "pilot batch",
      sourceFile: "serials.csv",
      devices: [
        { serialNumber: "AAA111", brand: "Apple", model: "iPad" },
        { serialNumber: "BBB222" },
      ],
    })
    expect(result).toMatchObject({ ok: true, registered: 2 })

    const [batch] = await db.select().from(schema.labelBatches)
    expect(batch).toMatchObject({ name: "pilot batch", sourceFile: "serials.csv" })
    // Knowing which host a batch points at is what makes a reprint decision
    // possible once stickers are already on devices.
    expect(batch.baseUrl).toBeTruthy()

    const devices = await db.select().from(schema.labelDevices)
    expect(devices.map((d) => d.serialKey).sort()).toEqual(["AAA111", "BBB222"])
  })

  test("re-validates server-side: a stale preview cannot slip a clash through", async () => {
    await db.insert(schema.orderUnits).values({
      id: "unit-clash",
      serialNumber: "AAA111",
      kind: "rental",
      status: "in_stock",
    })

    const result = await registerLabelBatch({
      name: "sneaky",
      devices: [{ serialNumber: "AAA-111" }, { serialNumber: "GOOD222" }],
    })
    expect(result).toMatchObject({ ok: true, registered: 1, clashes: ["AAA-111"] })

    const devices = await db.select().from(schema.labelDevices)
    expect(devices.map((d) => d.serialKey)).toEqual(["GOOD222"])
  })

  test("a batch where everything clashes is refused outright", async () => {
    await registerLabelBatch({ name: "first", devices: [{ serialNumber: "AAA111" }] })
    const result = await registerLabelBatch({ name: "again", devices: [{ serialNumber: "aaa111" }] })
    expect(result).toMatchObject({ error: "all_rows_clash" })
    expect(await db.select().from(schema.labelBatches)).toHaveLength(1)
  })

  test("registering never writes inventory", async () => {
    await registerLabelBatch({
      name: "isolated",
      devices: [{ serialNumber: "AAA111", brand: "Apple", model: "iPad" }],
    })
    expect(await db.select().from(schema.orderUnits)).toHaveLength(0)
  })
})

describe("printed stamp", () => {
  test("marks only the given devices", async () => {
    await registerLabelBatch({
      name: "b",
      devices: [{ serialNumber: "AAA111" }, { serialNumber: "BBB222" }],
    })
    const devices = await db.select().from(schema.labelDevices)
    const first = devices.find((d) => d.serialKey === "AAA111")!

    expect(await markLabelsPrinted([first.id])).toMatchObject({ ok: true, marked: 1 })

    const after = await db.select().from(schema.labelDevices)
    expect(after.find((d) => d.serialKey === "AAA111")!.printedAt).toBeGreaterThan(0)
    expect(after.find((d) => d.serialKey === "BBB222")!.printedAt).toBeNull()
  })

  test("an empty list is refused rather than stamping everything", async () => {
    expect(await markLabelsPrinted([])).toEqual({ error: "invalid_input" })
  })
})

describe("batch listing", () => {
  test("counts devices and how many are printed", async () => {
    await registerLabelBatch({
      name: "b",
      devices: [{ serialNumber: "AAA111" }, { serialNumber: "BBB222" }],
    })
    const devices = await db.select().from(schema.labelDevices)
    await markLabelsPrinted([devices[0].id])

    const list = await listLabelBatches()
    if ("error" in list) throw new Error(list.error)
    expect(list.rows[0]).toMatchObject({ name: "b", devices: 2, printed: 1 })
  })

  test("batch detail returns its devices; an unknown id is not found", async () => {
    const reg = await registerLabelBatch({ name: "b", devices: [{ serialNumber: "AAA111" }] })
    if ("error" in reg) throw new Error(reg.error)

    const detail = await getLabelBatch(reg.batchId!)
    if ("error" in detail) throw new Error(detail.error)
    expect(detail.devices).toHaveLength(1)

    expect(await getLabelBatch("nope")).toEqual({ error: "not_found" })
  })
})

describe("a printed sticker resolves before the device reaches inventory", () => {
  test("the device page falls back to the label record", async () => {
    await registerLabelBatch({
      name: "pre-arrival",
      devices: [{ serialNumber: "NEWBOX01", brand: "Lenovo", model: "T14 / i5 / 16GB" }],
    })

    staff.session = null // a plain scan, nobody signed in
    const view = await getDevicePublicView("NEWBOX01")
    expect(view).toMatchObject({
      serial: "NEWBOX01",
      brand: "Lenovo",
      model: "T14 / i5 / 16GB",
      activated: false,
    })
  })

  test("the real asset wins once the device is received", async () => {
    await registerLabelBatch({
      name: "pre-arrival",
      devices: [{ serialNumber: "NEWBOX02", brand: "Lenovo", model: "placeholder from upload" }],
    })
    await db.insert(schema.orderUnits).values({
      id: "unit-newbox02",
      serialNumber: "NEWBOX02",
      brand: "Lenovo",
      model: "T14 Gen 4 / i7 / 32GB",
      kind: "rental",
      status: "in_stock",
    })

    staff.session = null
    const view = await getDevicePublicView("NEWBOX02")
    // One device, one truth: inventory is authoritative once it exists.
    expect(view?.model).toBe("T14 Gen 4 / i7 / 32GB")
  })
})
