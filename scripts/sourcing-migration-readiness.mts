/**
 * Sourcing V2 migration-readiness report — READ-ONLY.
 *
 * Inspects every existing sourcing_request and its RFQ/quotation/evaluation/
 * case chain, proposes an item-mapping for each, and flags rows that cannot
 * map cleanly (in-flight evaluations, superseded chains, cases without a
 * derivable supplier). Writes NOTHING. Uses raw SQL over pre-V2 columns only,
 * so it runs against prod BEFORE migration 0017 is applied. Produces the
 * report the user reviews before any legacy transformation (Phase 6).
 *
 * Run:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/sourcing-migration-readiness.mts
 *   (falls back to file:local.db when no URL is set — same rule as lib/db)
 */
import { createClient, type Row } from "@libsql/client"

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db"
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

async function rows(sql: string, args: (string | number)[] = []): Promise<Row[]> {
  const res = await client.execute({ sql, args })
  return res.rows
}

const requests = await rows(
  `select id, source_type, description, status, created_at from sourcing_request order by created_at asc`
)

console.log(`# Sourcing V2 Migration-Readiness Report`)
console.log(`# DB: ${url.startsWith("file:") ? url : "remote (Turso)"}`)
console.log(`# Generated: ${new Date().toISOString()}`)
console.log(`# Mode: READ-ONLY — no rows were written or modified.\n`)
console.log(`Total sourcing_request rows: ${requests.length}\n`)

let cleanCount = 0
const flags: string[] = []

for (const req of requests) {
  const id = String(req.id)
  const rfqs = await rows(`select id, supplier_id, status from supplier_rfq where sourcing_request_id = ?`, [id])
  const quotations = rfqs.length
    ? await rows(
        `select id, rfq_id, status from supplier_quotation where rfq_id in (${rfqs.map(() => "?").join(",")})`,
        rfqs.map((r) => String(r.id))
      )
    : []
  const lines = quotations.length
    ? await rows(
        `select id, qty from supplier_quotation_line where quotation_id in (${quotations.map(() => "?").join(",")})`,
        quotations.map((q) => String(q.id))
      )
    : []
  const evaluations = await rows(
    `select id, status from commercial_evaluation where sourcing_request_id = ?`,
    [id]
  )
  const approvals = evaluations.length
    ? await rows(
        `select id, decision from commercial_approval where evaluation_id in (${evaluations.map(() => "?").join(",")})`,
        evaluations.map((e) => String(e.id))
      )
    : []
  const cases = await rows(
    `select id, status, external_po_ref from procurement_case where sourcing_request_id = ?`,
    [id]
  )

  console.log(`── sourcing_request ${id}`)
  console.log(
    `   status=${req.status} sourceType=${req.source_type} createdAt=${new Date(Number(req.created_at)).toISOString()}`
  )
  console.log(`   description: ${String(req.description).replaceAll("\n", " ").slice(0, 120)}`)
  console.log(
    `   chain: ${rfqs.length} RFQs, ${quotations.length} quotations, ${lines.length} quotation lines, ${evaluations.length} evaluations, ${approvals.length} approvals, ${cases.length} cases`
  )

  // Proposed mapping: the single description becomes one sourcing_request_item
  // (quantity from quotation-line qty if consistent, else 1), and every
  // quotation line gets linked to that item.
  const qtys = [...new Set(lines.map((l) => Number(l.qty)))]
  const proposedQty = qtys.length === 1 ? qtys[0] : 1
  console.log(
    `   proposed: 1 item { qty=${proposedQty}, customerDescription=description, supplierDescription=description } + link ${lines.length} quotation lines to it`
  )

  const reqFlags: string[] = []
  if (["under_evaluation", "quotes_received", "rfq_sent"].includes(String(req.status))) {
    reqFlags.push(`in-flight (status=${req.status}) — freeze rule: stays old-shape until superseded`)
  }
  if (qtys.length > 1) {
    reqFlags.push(`inconsistent quotation-line qtys (${qtys.join(", ")}) — qty needs manual decision`)
  }
  const activeEvals = evaluations.filter((e) => e.status === "active")
  if (activeEvals.length > 1) {
    reqFlags.push(`${activeEvals.length} active evaluations — supersede chain needs manual review`)
  }
  for (const c of cases) {
    // supplier_id backfill: derivable only via a linked internal PO.
    const pos = await rows(
      `select distinct supplier_id from purchase_order where procurement_case_id = ?`,
      [String(c.id)]
    )
    if (pos.length === 1) {
      const supplier = await rows(`select name from supplier where id = ?`, [String(pos[0].supplier_id)])
      console.log(
        `   case ${c.id}: supplier_id derivable from internal PO → ${supplier[0]?.name ?? pos[0].supplier_id}`
      )
    } else if (pos.length === 0) {
      // Not an error — commercial-flow cases link external ERP POs only.
      console.log(
        `   case ${c.id}: no internal PO — supplier_id left NULL (external ref: ${c.external_po_ref ?? "none"})`
      )
    } else {
      reqFlags.push(`case ${c.id}: ${pos.length} distinct suppliers across POs — cannot derive supplier_id`)
    }
  }

  if (reqFlags.length === 0) {
    cleanCount++
    console.log(`   ✅ maps cleanly`)
  } else {
    for (const f of reqFlags) {
      console.log(`   ⚠️  ${f}`)
      flags.push(`${id}: ${f}`)
    }
  }
  console.log("")
}

console.log(`── Summary`)
console.log(`   clean: ${cleanCount}/${requests.length}`)
console.log(`   flagged: ${requests.length - cleanCount}/${requests.length}`)
if (flags.length) {
  console.log(`\n   Flags requiring review before Phase 6 transformation:`)
  for (const f of flags) console.log(`   - ${f}`)
} else {
  console.log(`   No blockers — Phase 6 transformation can proceed after user approval.`)
}

client.close()
