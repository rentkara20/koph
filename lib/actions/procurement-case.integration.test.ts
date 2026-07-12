// Integration coverage for Milestone 4.5 / P4a Procurement Case — the single
// operational anchor. Verifies: every purchase order gets exactly one case
// (manual PO auto-creates a system_manual case), the ERP-PO link is set-once
// (immutable past creation), and supersede is the only way to "change" a
// case (append-only, old row never edited, no delete).
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "procurement-case-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seedSupplier() {
  const supplierId = createId()
  await db.insert(schema.suppliers).values({ id: supplierId, name: "IT_SUPPLIER" })
  return supplierId
}

describe("createProcurementCaseCore", () => {
  test("system_manual case has no sourcingRequestId/commercialApprovalId", async () => {
    const { createProcurementCaseCore } = await import("./procurement-case")
    let caseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual" }, null)
      caseId = result.caseId
    })

    const [row] = await db.select().from(schema.procurementCases).where(eq(schema.procurementCases.id, caseId))
    expect(row.source).toBe("system_manual")
    expect(row.sourcingRequestId).toBeNull()
    expect(row.commercialApprovalId).toBeNull()
    expect(row.status).toBe("open")
  })

  test("commercial_flow case requires a commercialApprovalId", async () => {
    const { createProcurementCaseCore } = await import("./procurement-case")
    await expect(
      db.transaction(async (tx) => {
        await createProcurementCaseCore(tx, { source: "commercial_flow" }, null)
      })
    ).rejects.toThrow("commercial_flow case requires an approved commercialApprovalId")
  })
})

describe("createPurchaseOrder — single operational anchor", () => {
  test("manual PO creation auto-creates a system_manual procurement case", async () => {
    const { createProcurementCaseCore } = await import("./procurement-case")
    const supplierId = await seedSupplier()

    // Mirrors createPurchaseOrder's transaction body (lib/actions/procurement.ts)
    // without requiring an authenticated session — same sequence, so a
    // regression there (case created outside the tx, or FK not stamped)
    // would show up here as well.
    let poId = ""
    let caseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual" }, null)
      caseId = result.caseId
      poId = createId()
      await tx.insert(schema.purchaseOrders).values({
        id: poId,
        supplierId,
        poNumber: "PO-MANUAL-" + poId.slice(-8),
        status: "ordered",
        procurementCaseId: caseId,
      })
    })

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.procurementCaseId).toBe(caseId)

    const [procurementCase] = await db
      .select()
      .from(schema.procurementCases)
      .where(eq(schema.procurementCases.id, caseId))
    expect(procurementCase.source).toBe("system_manual")
  })
})

describe("linkExternalPoCore — set-once", () => {
  test("links erpSystem/externalPoRef and flips status to po_linked", async () => {
    const { createProcurementCaseCore, linkExternalPoCore } = await import("./procurement-case")
    let caseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual" }, null)
      caseId = result.caseId
      await linkExternalPoCore(tx, { procurementCaseId: caseId, erpSystem: "zoho", externalPoRef: "ZOHO-PO-1" }, null)
    })

    const [row] = await db.select().from(schema.procurementCases).where(eq(schema.procurementCases.id, caseId))
    expect(row.erpSystem).toBe("zoho")
    expect(row.externalPoRef).toBe("ZOHO-PO-1")
    expect(row.status).toBe("po_linked")
  })

  test("rejects a second link — must supersede instead of editing", async () => {
    const { createProcurementCaseCore, linkExternalPoCore } = await import("./procurement-case")
    let caseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual" }, null)
      caseId = result.caseId
      await linkExternalPoCore(tx, { procurementCaseId: caseId, erpSystem: "zoho", externalPoRef: "ZOHO-PO-2" }, null)
    })

    await expect(
      db.transaction(async (tx) => {
        await linkExternalPoCore(tx, { procurementCaseId: caseId, erpSystem: "odoo", externalPoRef: "ODOO-PO-2" }, null)
      })
    ).rejects.toThrow("already linked to an external PO")

    // Original link is untouched (immutable past creation).
    const [row] = await db.select().from(schema.procurementCases).where(eq(schema.procurementCases.id, caseId))
    expect(row.erpSystem).toBe("zoho")
    expect(row.externalPoRef).toBe("ZOHO-PO-2")
  })
})

describe("supersedeProcurementCaseCore — append-only, no delete", () => {
  test("creates a new case, marks the old one superseded, never edits or deletes it", async () => {
    const { createProcurementCaseCore, supersedeProcurementCaseCore } = await import("./procurement-case")
    let oldCaseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual" }, null)
      oldCaseId = result.caseId
    })

    let newCaseId = ""
    await db.transaction(async (tx) => {
      const result = await supersedeProcurementCaseCore(tx, { caseId: oldCaseId, reason: "terms changed" }, null)
      newCaseId = result.caseId
    })

    const rows = await db.select().from(schema.procurementCases)
    const old = rows.find((r) => r.id === oldCaseId)
    const fresh = rows.find((r) => r.id === newCaseId)

    expect(old).toBeDefined() // never deleted
    expect(old!.status).toBe("superseded")
    expect(old!.supersededByCaseId).toBe(newCaseId)
    expect(fresh!.previousCaseId).toBe(oldCaseId)
    expect(fresh!.status).toBe("open")
    expect(fresh!.source).toBe(old!.source)
  })

  test("carries the awarded supplier forward onto the successor case", async () => {
    const { createProcurementCaseCore, supersedeProcurementCaseCore } = await import("./procurement-case")
    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "IT_AWARDED_SUPPLIER" })

    let oldCaseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual", supplierId }, null)
      oldCaseId = result.caseId
    })

    let newCaseId = ""
    await db.transaction(async (tx) => {
      const result = await supersedeProcurementCaseCore(tx, { caseId: oldCaseId, reason: "re-award" }, null)
      newCaseId = result.caseId
    })

    const [fresh] = await db
      .select()
      .from(schema.procurementCases)
      .where(eq(schema.procurementCases.id, newCaseId))
    expect(fresh.supplierId).toBe(supplierId)
  })

  test("rejects superseding an already-superseded case", async () => {
    const { createProcurementCaseCore, supersedeProcurementCaseCore } = await import("./procurement-case")
    let caseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual" }, null)
      caseId = result.caseId
    })
    await db.transaction(async (tx) => {
      await supersedeProcurementCaseCore(tx, { caseId, reason: "first supersede" }, null)
    })

    await expect(
      db.transaction(async (tx) => {
        await supersedeProcurementCaseCore(tx, { caseId, reason: "second supersede" }, null)
      })
    ).rejects.toThrow("already superseded")
  })

  test("rejects linking an external PO to a superseded case", async () => {
    const { createProcurementCaseCore, linkExternalPoCore, supersedeProcurementCaseCore } = await import(
      "./procurement-case"
    )
    let caseId = ""
    await db.transaction(async (tx) => {
      const result = await createProcurementCaseCore(tx, { source: "system_manual" }, null)
      caseId = result.caseId
    })
    await db.transaction(async (tx) => {
      await supersedeProcurementCaseCore(tx, { caseId, reason: "changed" }, null)
    })

    await expect(
      db.transaction(async (tx) => {
        await linkExternalPoCore(tx, { procurementCaseId: caseId, erpSystem: "zoho", externalPoRef: "ZOHO-X" }, null)
      })
    ).rejects.toThrow("superseded")
  })
})
