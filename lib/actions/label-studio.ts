"use server"

import { revalidatePath } from "next/cache"
import { desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/lib/db"
import { labelBatches, labelDevices, orderUnits } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole } from "@/lib/auth/session"
import { parseCsv } from "@/lib/import-export/csv"
import {
  DEFAULT_LABEL_BASE_URL,
  resolveHeaders,
  serialKey,
  validateRows,
  type ParsedRow,
} from "@/lib/domain/label-studio"

/** Server-side source of truth for the printed prefix. */
function labelBaseUrl(): string {
  return process.env.LABEL_BASE_URL || DEFAULT_LABEL_BASE_URL
}

async function requireStaff() {
  const session = await getSessionWithRole("admin", "finance", "viewer")
  if (!session) return null
  return session
}

/** The printed prefix, for a server component to hand to the client. */
export async function getLabelBaseUrl(): Promise<string> {
  return labelBaseUrl()
}

/** Serials that already have an identity — a real asset or an earlier batch. */
async function existingSerialKeys(): Promise<Set<string>> {
  const normalised = sql<string>`UPPER(REPLACE(REPLACE(REPLACE(${orderUnits.serialNumber}, '-', ''), ' ', ''), '_', ''))`
  const [units, labels] = await Promise.all([
    db
      .select({ key: normalised })
      .from(orderUnits)
      .where(sql`${orderUnits.serialNumber} IS NOT NULL AND LENGTH(TRIM(${orderUnits.serialNumber})) > 0`),
    db.select({ key: labelDevices.serialKey }).from(labelDevices),
  ])
  return new Set([...units, ...labels].map((r) => r.key).filter(Boolean))
}

// ─── Upload → validate (no writes) ──────────────────────────────────────────

export type ValidationResult = {
  rows: ParsedRow[]
  /** Headers we recognised, so the operator can see what was matched. */
  matched: Record<string, string | null>
  printable: number
  blocked: number
}

/**
 * Parses and validates an uploaded CSV. Writes nothing: the operator reviews
 * the table, previews the labels, and only then registers a batch.
 *
 * A serial that already exists — as a KOPH asset OR in an earlier batch — is
 * flagged rather than accepted. Two QR codes for one device is the failure
 * this whole check exists to prevent.
 */
export async function validateLabelUpload(csvText: string): Promise<ValidationResult | { error: string }> {
  if (!(await requireStaff())) return { error: "forbidden" }
  if (!csvText.trim()) return { error: "empty_file" }
  if (csvText.length > 2_000_000) return { error: "file_too_large" }

  const { headers, rows } = parseCsv(csvText)
  const matched = resolveHeaders(headers)
  if (!matched.serialNumber) return { error: "no_serial_column" }

  const existing = await existingSerialKeys()
  const parsed = validateRows(rows, headers, existing)

  return {
    rows: parsed,
    matched,
    printable: parsed.filter((r) => r.issues.length === 0).length,
    blocked: parsed.filter((r) => r.issues.length > 0).length,
  }
}

// ─── Register a batch (the only write path) ─────────────────────────────────

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sourceFile: z.string().trim().max(200).optional(),
  devices: z
    .array(
      z.object({
        serialNumber: z.string().trim().min(1).max(40),
        brand: z.string().trim().max(80).optional(),
        model: z.string().trim().max(300).optional(),
        deviceType: z.string().trim().max(80).optional(),
      })
    )
    .min(1)
    .max(2000),
})

/**
 * Registers the operator's selected rows as a batch. Re-validates server-side:
 * the client sends what the operator ticked, but the duplicate check is
 * re-run here so a stale preview cannot slip a clashing serial through.
 */
export async function registerLabelBatch(input: unknown) {
  const staff = await getSessionWithRole("admin")
  if (!staff) return { error: "forbidden" }

  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" }

  const existing = await existingSerialKeys()
  const seen = new Set<string>()
  const clashes: string[] = []
  const rows: Array<{
    serialNumber: string
    brand?: string
    model?: string
    deviceType?: string
    key: string
  }> = []

  for (const d of parsed.data.devices) {
    const key = serialKey(d.serialNumber)
    if (!key || existing.has(key) || seen.has(key)) {
      clashes.push(d.serialNumber)
      continue
    }
    seen.add(key)
    rows.push({ ...d, key })
  }

  if (rows.length === 0) return { error: "all_rows_clash", clashes }

  const batchId = createId()
  await db.transaction(async (tx) => {
    await tx.insert(labelBatches).values({
      id: batchId,
      name: parsed.data.name,
      sourceFile: parsed.data.sourceFile ?? null,
      baseUrl: labelBaseUrl(),
      createdBy: staff.user.id,
    })
    await tx.insert(labelDevices).values(
      rows.map((r) => ({
        id: createId(),
        batchId,
        serialNumber: r.serialNumber,
        serialKey: r.key,
        brand: r.brand ?? null,
        model: r.model ?? null,
        deviceType: r.deviceType ?? null,
      }))
    )
  })

  revalidatePath("/admin/labels")
  return { ok: true, batchId, registered: rows.length, clashes }
}

// ─── Reading batches ────────────────────────────────────────────────────────

export async function listLabelBatches() {
  if (!(await requireStaff())) return { error: "forbidden" as const }

  const batches = await db
    .select()
    .from(labelBatches)
    .orderBy(desc(labelBatches.createdAt))
    .limit(50)
  if (batches.length === 0) return { rows: [] }

  // Counted with one grouped query rather than a correlated subquery per row:
  // simpler to read and it stays a single round trip.
  const counts = await db
    .select({
      batchId: labelDevices.batchId,
      devices: sql<number>`COUNT(*)`,
      printed: sql<number>`SUM(CASE WHEN ${labelDevices.printedAt} IS NULL THEN 0 ELSE 1 END)`,
    })
    .from(labelDevices)
    .where(
      inArray(
        labelDevices.batchId,
        batches.map((b) => b.id)
      )
    )
    .groupBy(labelDevices.batchId)

  const byBatch = new Map(counts.map((c) => [c.batchId, c]))

  return {
    rows: batches.map((b) => ({
      id: b.id,
      name: b.name,
      sourceFile: b.sourceFile,
      baseUrl: b.baseUrl,
      createdAt: b.createdAt,
      devices: Number(byBatch.get(b.id)?.devices ?? 0),
      printed: Number(byBatch.get(b.id)?.printed ?? 0),
    })),
  }
}

export async function getLabelBatch(batchId: string) {
  if (!(await requireStaff())) return { error: "forbidden" as const }

  const [batch] = await db.select().from(labelBatches).where(eq(labelBatches.id, batchId)).limit(1)
  if (!batch) return { error: "not_found" as const }

  const devices = await db
    .select()
    .from(labelDevices)
    .where(eq(labelDevices.batchId, batchId))
    .orderBy(labelDevices.createdAt)

  return { batch, devices }
}

/**
 * Stamps the selected devices as printed. Called after the operator downloads
 * the print file — it records that a sticker exists in the physical world, so
 * a reprint is a visible decision rather than an accident.
 */
export async function markLabelsPrinted(deviceIds: string[]) {
  const staff = await getSessionWithRole("admin")
  if (!staff) return { error: "forbidden" }
  if (deviceIds.length === 0 || deviceIds.length > 2000) return { error: "invalid_input" }

  await db
    .update(labelDevices)
    .set({ printedAt: Date.now() })
    .where(inArray(labelDevices.id, deviceIds))

  revalidatePath("/admin/labels")
  return { ok: true, marked: deviceIds.length }
}
