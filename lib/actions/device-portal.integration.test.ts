// The printed sticker is permanent hardware: /d/<serial> must resolve forever,
// and everything that can change has to be data, not code.
//
// Three refusals carry the design and are asserted here:
//   1. A stranger who scans a device learns what the device is — never who
//      holds it. Masked values must not leak the real characters.
//   2. Whoever physically holds a device cannot rewrite inventory. A data
//      correction is a proposal until an admin applies it.
//   3. A transfer between two of the customer's employees needs no KARA
//      approval, but the previous holder is kept as history — never overwritten.
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { and, eq } from "drizzle-orm"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"

const ADMIN_ID = "admin-device-portal"
const SERIAL = "HK56KK4N66"

const holder = vi.hoisted(() => ({ db: null as unknown }))
// Cookie jar the actions read/write through next/headers.
const jar = vi.hoisted(() => ({ store: new Map<string, string>() }))
const staff = vi.hoisted(() => ({ session: null as unknown }))
const allowRate = vi.hoisted(() => ({ on: true }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["user-agent", "vitest"]])),
  cookies: vi.fn(async () => ({
    get: (k: string) => (jar.store.has(k) ? { value: jar.store.get(k) } : undefined),
    set: (k: string, v: string) => void jar.store.set(k, v),
    delete: (k: string) => void jar.store.delete(k),
  })),
}))
// The limiter is process-global and would otherwise trip partway through the
// suite (every test activates the same serial). Its own behaviour is asserted
// in the dedicated test at the bottom.
vi.mock("@/lib/utils/rate-limit", () => ({
  checkRateLimit: vi.fn(() => allowRate.on),
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionWithRole: vi.fn(async () => staff.session),
  getStaffSession: vi.fn(async () => staff.session),
}))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import {
  activateDevice,
  getDevicePublicView,
  getDeviceServicesView,
  releaseDevice,
  reviewDeviceServiceRequest,
  submitDeviceServiceRequest,
} from "./device-portal"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "device-portal-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({
    id: ADMIN_ID,
    name: "Admin",
    email: "admin@device-portal.local",
    role: "admin",
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

beforeEach(async () => {
  jar.store.clear()
  staff.session = null
  allowRate.on = true
  await db.delete(schema.deviceServiceRequests)
  await db.delete(schema.deviceClaims)
  await db.delete(schema.orderUnits)
  await db.insert(schema.orderUnits).values({
    id: "unit-hk56",
    serialNumber: SERIAL,
    brand: "Apple",
    model: "iPad Pro 3rd Gen, 11-inch, Storage 128GB",
    deviceType: "Tablet",
    kind: "rental",
    status: "delivered",
  })
})

const CLAIM = {
  name: "Abdelrahman Test Holder",
  email: "test.holder@example.com",
  mobile: "0501234567",
  consent: true as const,
}

describe("device sticker resolves", () => {
  test("unknown serial is not found rather than an empty page", async () => {
    expect(await getDevicePublicView("NOPE12345")).toBeNull()
  })

  test("printed serial resolves regardless of separators and case", async () => {
    for (const printed of ["HK56KK4N66", "hk56kk4n66", "HK56-KK4N-66"]) {
      const view = await getDevicePublicView(printed)
      expect(view?.serial).toBe(SERIAL)
    }
  })

  test("public view carries device identity but never activation PII", async () => {
    const view = await getDevicePublicView(SERIAL)
    expect(view).toMatchObject({ brand: "Apple", inService: true, activated: false })
    expect(view?.holder).toBeNull()
  })
})

describe("activation", () => {
  test("requires consent and a plausible mobile", async () => {
    expect(await activateDevice(SERIAL, { ...CLAIM, consent: false })).toHaveProperty("error")
    expect(await activateDevice(SERIAL, { ...CLAIM, mobile: "abc" })).toHaveProperty("error")
    const [none] = await db.select().from(schema.deviceClaims)
    expect(none).toBeUndefined()
  })

  test("stores the claim, records consent, and cookies the holder", async () => {
    const result = await activateDevice(SERIAL, CLAIM)
    expect(result).toMatchObject({ ok: true, transferred: false })

    const [claim] = await db.select().from(schema.deviceClaims)
    expect(claim).toMatchObject({
      serialNumber: SERIAL,
      holderName: CLAIM.name,
      holderEmail: CLAIM.email,
      status: "active",
    })
    expect(claim.consentAt).toBeGreaterThan(0)
    // The secret lives in the cookie, never in a rendered field.
    expect([...jar.store.values()]).toContain(claim.holderSecret)
  })

  test("the holder sees their own details in full", async () => {
    await activateDevice(SERIAL, CLAIM)
    const view = await getDevicePublicView(SERIAL)
    expect(view).toMatchObject({ activated: true, isHolder: true })
    expect(view?.holder).toEqual({
      name: CLAIM.name,
      email: CLAIM.email,
      mobile: CLAIM.mobile,
    })
  })

  test("a stranger scanning the same sticker gets masked contact details", async () => {
    await activateDevice(SERIAL, CLAIM)
    jar.store.clear() // different phone, no cookie

    const view = await getDevicePublicView(SERIAL)
    expect(view?.activated).toBe(true)
    expect(view?.isHolder).toBe(false)

    const { name, email, mobile } = view!.holder!
    expect(name).toBe("Abdelrahman ••••") // first name only
    expect(email).not.toContain("test.holder")
    expect(email).not.toContain("example")
    expect(mobile).not.toContain("050123")
    // The last 4 digits are the only real characters kept, deliberately, so a
    // holder can recognise their own line.
    expect(mobile).toBe("••••4567")
  })

  test("KARA staff see the real details", async () => {
    await activateDevice(SERIAL, CLAIM)
    jar.store.clear()
    staff.session = { user: { id: ADMIN_ID } }

    const view = await getDevicePublicView(SERIAL)
    expect(view?.holder?.email).toBe(CLAIM.email)
  })
})

describe("transfer between the customer's own employees", () => {
  test("the new holder claims it without KARA, and the old claim survives as history", async () => {
    await activateDevice(SERIAL, CLAIM)
    jar.store.clear()

    const second = {
      name: "Second Employee",
      email: "second@example.com",
      mobile: "0559876543",
      consent: true as const,
      reason: "moved department",
    }
    expect(await activateDevice(SERIAL, second)).toMatchObject({ ok: true, transferred: true })

    const claims = await db.select().from(schema.deviceClaims)
    expect(claims).toHaveLength(2)

    const active = claims.filter((c) => c.status === "active")
    expect(active).toHaveLength(1)
    expect(active[0].holderName).toBe(second.name)

    const released = claims.find((c) => c.status === "released")!
    expect(released.holderName).toBe(CLAIM.name)
    expect(released.releaseReason).toBe("moved department")
    expect(released.releasedAt).toBeGreaterThan(0)
  })

  test("the previous holder's cookie stops unlocking the device", async () => {
    await activateDevice(SERIAL, CLAIM)
    const oldJar = new Map(jar.store)

    jar.store.clear()
    await activateDevice(SERIAL, {
      name: "Second Employee",
      email: "second@example.com",
      mobile: "0559876543",
      consent: true as const,
    })

    jar.store = oldJar
    const view = await getDevicePublicView(SERIAL)
    expect(view?.isHolder).toBe(false)
    expect(view?.holder?.name).toBe("Second ••••")
  })

  test("releasing clears the claim so the next employee starts clean", async () => {
    await activateDevice(SERIAL, CLAIM)
    expect(await releaseDevice(SERIAL, "returned to IT")).toMatchObject({ ok: true })

    const view = await getDevicePublicView(SERIAL)
    expect(view?.activated).toBe(false)
    expect(view?.holder).toBeNull()
  })
})

describe("service requests", () => {
  test("an unactivated device accepts nothing", async () => {
    expect(
      await submitDeviceServiceRequest(SERIAL, { kind: "maintenance", note: "screen cracked" })
    ).toEqual({ error: "not_activated" })
  })

  test("someone without the holder cookie cannot file a request", async () => {
    await activateDevice(SERIAL, CLAIM)
    jar.store.clear()
    expect(
      await submitDeviceServiceRequest(SERIAL, { kind: "maintenance", note: "screen cracked" })
    ).toEqual({ error: "forbidden" })
  })

  test("a disabled service is rejected even if its key is guessed", async () => {
    await activateDevice(SERIAL, CLAIM)
    // stocktake ships disabled until an admin turns it on
    expect(
      await submitDeviceServiceRequest(SERIAL, { kind: "stocktake", note: "present" })
    ).toEqual({ error: "invalid_service" })
  })

  test("an empty request is refused", async () => {
    await activateDevice(SERIAL, CLAIM)
    expect(await submitDeviceServiceRequest(SERIAL, { kind: "maintenance" })).toEqual({
      error: "empty_request",
    })
  })

  test("the holder files a maintenance ticket", async () => {
    await activateDevice(SERIAL, CLAIM)
    expect(
      await submitDeviceServiceRequest(SERIAL, { kind: "maintenance", note: "screen cracked" })
    ).toMatchObject({ ok: true })

    const [req] = await db.select().from(schema.deviceServiceRequests)
    expect(req).toMatchObject({ serialNumber: SERIAL, kind: "maintenance", status: "submitted" })
    expect(JSON.parse(req.payload)).toEqual({ note: "screen cracked" })
  })

  test("request history is the holder's own — a stranger sees none of it", async () => {
    await activateDevice(SERIAL, CLAIM)
    await submitDeviceServiceRequest(SERIAL, { kind: "maintenance", note: "screen cracked" })

    const own = await getDeviceServicesView(SERIAL)
    expect(own?.isHolder).toBe(true)
    expect(own?.requests).toHaveLength(1)

    jar.store.clear()
    const stranger = await getDeviceServicesView(SERIAL)
    expect(stranger?.isHolder).toBe(false)
    expect(stranger?.requests).toHaveLength(0)
    expect(stranger?.holderName).toBeNull()
  })

  test("only enabled services are offered", async () => {
    await activateDevice(SERIAL, CLAIM)
    const view = await getDeviceServicesView(SERIAL)
    expect(view?.services.map((s) => s.key)).toEqual(["device_data", "maintenance", "question"])
  })

  test("the catalogue comes from app_setting, so it changes without a deploy", async () => {
    await activateDevice(SERIAL, CLAIM)
    await db.insert(schema.appSettings).values({
      key: "device_portal_services",
      value: JSON.stringify([
        {
          key: "stocktake_2026",
          labelAr: "تأكيد الجرد",
          labelEn: "Confirm stocktake",
          note: true,
          editsDeviceData: false,
          enabled: true,
        },
      ]),
    })

    const view = await getDeviceServicesView(SERIAL)
    expect(view?.services.map((s) => s.key)).toEqual(["stocktake_2026"])
    // the previously shipped keys are gone, not merely hidden
    expect(
      await submitDeviceServiceRequest(SERIAL, { kind: "maintenance", note: "x" })
    ).toEqual({ error: "invalid_service" })
    expect(
      await submitDeviceServiceRequest(SERIAL, { kind: "stocktake_2026", note: "present" })
    ).toMatchObject({ ok: true })

    await db.delete(schema.appSettings)
  })
})

describe("device-data corrections never bypass review", () => {
  test("a correction is stored as a proposal and inventory is untouched", async () => {
    await activateDevice(SERIAL, CLAIM)
    await submitDeviceServiceRequest(SERIAL, {
      kind: "device_data",
      model: "iPad Pro 3rd Gen, 11-inch, Storage 256GB",
      note: "storage is 256GB",
    })

    const [unit] = await db
      .select()
      .from(schema.orderUnits)
      .where(eq(schema.orderUnits.id, "unit-hk56"))
    expect(unit.model).toBe("iPad Pro 3rd Gen, 11-inch, Storage 128GB")

    const [req] = await db.select().from(schema.deviceServiceRequests)
    expect(req.status).toBe("submitted")
  })

  test("a non-admin cannot apply a proposal", async () => {
    await activateDevice(SERIAL, CLAIM)
    await submitDeviceServiceRequest(SERIAL, { kind: "device_data", model: "tampered" })
    const [req] = await db.select().from(schema.deviceServiceRequests)

    staff.session = null
    expect(await reviewDeviceServiceRequest(req.id, "applied")).toEqual({ error: "forbidden" })

    const [unit] = await db.select().from(schema.orderUnits)
    expect(unit.model).not.toBe("tampered")
  })

  test("an admin applying the proposal is the only path into order_unit", async () => {
    await activateDevice(SERIAL, CLAIM)
    await submitDeviceServiceRequest(SERIAL, {
      kind: "device_data",
      model: "iPad Pro 3rd Gen, 11-inch, Storage 256GB",
      deviceType: "Tablet",
    })
    const [req] = await db.select().from(schema.deviceServiceRequests)

    staff.session = { user: { id: ADMIN_ID } }
    expect(await reviewDeviceServiceRequest(req.id, "applied", "confirmed by warehouse")).toEqual({
      ok: true,
    })

    const [unit] = await db.select().from(schema.orderUnits)
    expect(unit.model).toBe("iPad Pro 3rd Gen, 11-inch, Storage 256GB")

    const [reviewed] = await db.select().from(schema.deviceServiceRequests)
    expect(reviewed).toMatchObject({
      status: "applied",
      reviewedBy: ADMIN_ID,
      adminNote: "confirmed by warehouse",
    })
  })

  test("rejecting leaves the record alone", async () => {
    await activateDevice(SERIAL, CLAIM)
    await submitDeviceServiceRequest(SERIAL, { kind: "device_data", model: "wrong guess" })
    const [req] = await db.select().from(schema.deviceServiceRequests)

    staff.session = { user: { id: ADMIN_ID } }
    expect(await reviewDeviceServiceRequest(req.id, "rejected")).toEqual({ ok: true })

    const [unit] = await db.select().from(schema.orderUnits)
    expect(unit.model).toBe("iPad Pro 3rd Gen, 11-inch, Storage 128GB")
  })

  test("a proposal cannot be applied twice", async () => {
    await activateDevice(SERIAL, CLAIM)
    await submitDeviceServiceRequest(SERIAL, { kind: "device_data", model: "Model A" })
    const [req] = await db.select().from(schema.deviceServiceRequests)

    staff.session = { user: { id: ADMIN_ID } }
    expect(await reviewDeviceServiceRequest(req.id, "applied")).toEqual({ ok: true })
    expect(await reviewDeviceServiceRequest(req.id, "applied")).toEqual({
      error: "already_reviewed",
    })
  })
})

describe("one active holder per device", () => {
  test("the DB refuses a second active claim on the same serial", async () => {
    await activateDevice(SERIAL, CLAIM)
    const [claim] = await db.select().from(schema.deviceClaims)

    await expect(
      db.insert(schema.deviceClaims).values({
        id: "second-active",
        serialNumber: claim.serialNumber,
        holderName: "Sneaky",
        holderEmail: "sneaky@example.com",
        holderMobile: "0500000000",
        holderSecret: "x",
        consentAt: Date.now(),
        status: "active",
        claimedAt: Date.now(),
      })
    ).rejects.toThrow()
  })
})

describe("abuse control", () => {
  test("a rate-limited scan is refused before anything is written", async () => {
    allowRate.on = false
    expect(await activateDevice(SERIAL, CLAIM)).toEqual({ error: "rate_limited" })
    expect(await db.select().from(schema.deviceClaims)).toHaveLength(0)
  })
})
