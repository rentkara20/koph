/**
 * Seeds a PREVIEW/QA database with the minimum needed to walk the mobile
 * signing flow end to end. Run with:
 *
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/seed-preview.mts
 *   PREVIEW_DB_FILE=file:local-preview.db npx tsx scripts/seed-preview.mts
 *
 * Rules this script enforces on itself, because a QA fixture that looks like
 * real data is how test rows end up quoted in a real dispute:
 *
 *   - It REFUSES to run against the production database.
 *   - Every row it writes is named with a QA- prefix and obviously fake
 *     contact details, so nothing here can be mistaken for a real customer.
 *   - It is idempotent: re-running reuses the same fixture instead of piling
 *     up more.
 *
 * It applies no migrations. Migrate first, then seed.
 */
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { eq } from "drizzle-orm"
import { config } from "dotenv"
import * as schema from "../lib/db/schema"
import { createId, generateSecureToken } from "../lib/utils/ids"
import { assertSafeSeedTarget } from "../lib/domain/seed-target-guard"

config({ path: ".env.local", quiet: true })

const url = process.env.PREVIEW_DB_FILE ?? process.env.TURSO_DATABASE_URL?.replace(/"/g, "")
const authToken = process.env.TURSO_AUTH_TOKEN?.replace(/"/g, "")

if (!url) {
  console.error("No database given. Set PREVIEW_DB_FILE or TURSO_DATABASE_URL.")
  process.exit(2)
}

// Hard stop. The rule lives in lib/domain/seed-target-guard.ts with its own
// tests, and it is an allowlist, not a blocklist: a remote database must
// positively identify itself as preview/staging/qa/test. The production
// database's name is not visible from this machine, so guessing it would have
// been the one mistake that cannot be undone.
try {
  assertSafeSeedTarget(url)
} catch (error) {
  console.error(`${(error as Error).message}\n  target: ${url.replace(/\/\/.*@/, "//***@")}`)
  process.exit(2)
}
if (process.env.ALLOW_PROD_SEED) {
  console.error("ALLOW_PROD_SEED is deliberately not honoured. Seed fixtures never go to production.")
  process.exit(2)
}

const client = createClient({ url, authToken })
const db = drizzle(client, { schema })
console.log(`seeding ${url.replace(/\/\/.*@/, "//***@")}\n`)

const QA_ADMIN_EMAIL = "qa-admin@preview.invalid"
const QA_CUSTOMER = "QA- Preview Customer (not a real customer)"
const QA_PARTNER = "QA- Preview Courier"
const QA_REQUEST_NUMBER = "QA-REQ-0001"

async function main() {
  // ── config rows the flow reads
  await db
    .insert(schema.requestTypes)
    .values({ id: createId(), slug: "delivery", nameEn: "Delivery", nameAr: "توصيل", sortOrder: 1 })
    .onConflictDoNothing()
  const [deliveryType] = await db
    .select()
    .from(schema.requestTypes)
    .where(eq(schema.requestTypes.slug, "delivery"))

  await db
    .insert(schema.consentVersions)
    .values({
      id: createId(),
      version: "1.0",
      textEn: "QA preview consent text.",
      textAr: "نص موافقة لبيئة الاختبار.",
      isActive: true,
    })
    .onConflictDoNothing()

  // ── staff user (no credential account: sign in is out of scope for the
  //    mobile signing walk-through, which is entirely token-gated)
  let [admin] = await db.select().from(schema.users).where(eq(schema.users.email, QA_ADMIN_EMAIL))
  if (!admin) {
    const id = createId()
    await db
      .insert(schema.users)
      .values({ id, name: "QA Admin", email: QA_ADMIN_EMAIL, role: "admin" })
    ;[admin] = await db.select().from(schema.users).where(eq(schema.users.id, id))
  }

  // ── customer + receiving contact
  let [customer] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.name, QA_CUSTOMER))
  if (!customer) {
    const id = createId()
    await db.insert(schema.customers).values({
      id,
      name: QA_CUSTOMER,
      mobile: "0500000000",
      email: "qa-customer@preview.invalid",
    })
    ;[customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, id))
    await db.insert(schema.customerContacts).values({
      id: createId(),
      customerId: id,
      name: "QA- Receiver",
      mobile: "0500000001",
      email: "qa-receiver@preview.invalid",
    })
    await db.insert(schema.customerContacts).values({
      id: createId(),
      customerId: id,
      name: "QA- Authorised Signatory",
      mobile: "0500000002",
      email: "qa-signatory@preview.invalid",
      isAuthorizedSignatory: true,
    })
  }

  // ── courier partner
  let [partner] = await db
    .select()
    .from(schema.partners)
    .where(eq(schema.partners.name, QA_PARTNER))
  if (!partner) {
    const id = createId()
    await db.insert(schema.partners).values({
      id,
      name: QA_PARTNER,
      contactPerson: "QA Courier",
      mobile: "0500000003",
      status: "active",
    })
    ;[partner] = await db.select().from(schema.partners).where(eq(schema.partners.id, id))
  }

  // ── request + two items, one of them serialised, so the signing page shows
  //    a per-item condition row (the part worth eyeballing on a phone)
  let [request] = await db
    .select()
    .from(schema.requests)
    .where(eq(schema.requests.requestNumber, QA_REQUEST_NUMBER))
  if (!request) {
    const id = createId()
    await db.insert(schema.requests).values({
      id,
      requestNumber: QA_REQUEST_NUMBER,
      trackingCode: `QA${createId().slice(0, 6).toUpperCase()}`,
      typeId: deliveryType.id,
      customerId: customer.id,
      quoteNumber: "QA-Q-0001",
      status: "in_progress",
    })
    await db.insert(schema.requestItems).values([
      {
        id: createId(),
        requestId: id,
        description: "QA- Laptop 14in",
        serialNumber: "QA-SN-0001",
        quantity: 1,
      },
      { id: createId(), requestId: id, description: "QA- Charger", quantity: 2 },
    ])
    ;[request] = await db.select().from(schema.requests).where(eq(schema.requests.id, id))
  }

  // ── an in-progress task, which is the state the signing page requires
  let [task] = await db
    .select()
    .from(schema.partnerTasks)
    .where(eq(schema.partnerTasks.requestId, request.id))
  if (!task) {
    const id = createId()
    await db.insert(schema.partnerTasks).values({
      id,
      requestId: request.id,
      kind: "request",
      partnerId: partner.id,
      taskTypeId: deliveryType.id,
      taskToken: generateSecureToken(),
      // 30 days: long enough that a QA link does not expire mid-session.
      taskTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      status: "in_progress",
      photoRequired: false,
      scheduledAt: Date.now(),
    })
    ;[task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, id))
  }

  console.log("fixture ready\n")
  console.log(`  customer      ${customer.name}`)
  console.log(`  partner       ${partner.name}`)
  console.log(`  request       ${request.requestNumber} (${request.status})`)
  console.log(`  task status   ${task.status}`)
  console.log(`\n  OPEN THIS ON THE PHONE:  /task/${task.taskToken}\n`)
}

await main()
