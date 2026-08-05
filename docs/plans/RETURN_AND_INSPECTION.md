# Device Return & Inspection — Design

**Status:** design only. No code, no migration, no deploy.
**Date:** 2026-07-31
**Depends on:** `feat/collection-receipt` (branch, unmerged)
**Scope:** KOPH only.

Splits the single "collection" event into the two things it actually is: a
**custody handover** at the customer's door, and a **detailed inspection** back
at the warehouse. Today KOPH collapses both into one signature, which is why
the receipt had to be hedged with "هذا الاستلام مبدئي" — the document promises
an inspection the system cannot record.

---

## 1. Reading of the current schema and workflow

### 1.1 How a collection runs today (post `feat/collection-receipt`)

```
Request(type=collection)
  → import delivered units          (getDeliveredOrderUnitsCore — inbound mode)
  → partner_task                    (partnerId NOT NULL; the only way to close a request)
  → signature_request               (customer signs; Kara rep signs the printout by hand)
  → signature_item_condition        (per item: good | damaged | missing)
  → signOffTask                     (tasks.ts:883)
      └─ applyAssetTransition(unit, "return")   delivered → returned
  → asset detail page: restock / send_maintenance / mark_damaged   (manual, per device)
```

### 1.2 The state machine that already exists

`lib/domain/asset-status.ts` is a real, enforced state machine. Every write goes
through `applyAssetTransition`, which is the single chokepoint (`OI-1`).

Relevant existing transitions:

| action | from | to |
|---|---|---|
| `return` | delivered, assigned | **returned** |
| `restock` | returned, damaged | in_stock |
| `send_maintenance` | in_stock, returned, damaged | maintenance |
| `mark_damaged` | in_stock, returned, delivered, maintenance | damaged |
| `mark_lost` | delivered, assigned, in_stock, returned | lost |
| `retire` | in_stock, returned, damaged, maintenance | retired |

**`returned` is already the "collected but not yet dispositioned" state.** Every
disposition the brief asks for is already reachable from it. This is the single
most important finding in this document: the lifecycle does not need a new
status, and `pending_inspection` should NOT be added as an asset status.

### 1.3 Where the gaps actually are

1. **No functional axis.** `signature_item_condition.condition` is
   `good | damaged | missing` — a *physical/presence* axis. There is nowhere to
   say "لم يُفحص" or "powers on but battery dead". The printed receipt now
   promises a later inspection with no table to hold its result.
2. **Disposition is untracked intent.** Moving a device from `returned` to
   `in_stock` is a bare status change. Nothing records *why*, who decided,
   against what evidence, or whether the customer owes anything.
3. **No per-device evidence at inspection time.** `attachments` is polymorphic
   and already supports `asset`, but nothing binds a photo to an inspection
   finding.
4. **Nothing aggregates.** There is no object answering "is this whole return
   settled?" — which is exactly what a Clearance Decision is.

---

## 2. Existing entities that can be reused

Reuse is high. Almost nothing here is new infrastructure.

| Need | Existing | Verdict |
|---|---|---|
| Custody handover doc | `signature_request` + `customer_signature` + snapshot | **reuse as-is** |
| Per-item condition at handover | `signature_item_condition` | **reuse as-is** — it is the Phase-A record |
| Custody state | `order_unit.status = returned` | **reuse** — no new status |
| Disposition transitions | `applyAssetTransition` + existing actions | **reuse** — all four targets reachable |
| Audit trail | `asset_event` (`type` is text, no CHECK) | **reuse**, add enum values |
| Evidence/photos | `attachments` (polymorphic, Vercel Blob, `sensitivity`) | **reuse**, add one `entityType` value |
| Who inspected | `users` + `getSessionWithRole` | reuse |
| Document rendering | `delivery-note-view.tsx` + `/sign/[token]/print` | reuse the shell |
| Numbering | `buildDeliveryNoteName` in `lib/utils/city-iata.ts` | extend |

**Enum values are free.** Drizzle's `text({ enum: [...] })` emits plain `text` in
SQLite with no CHECK constraint — verified against all 43 migrations, where the
only CHECKs are the four explicitly declared ones (`order_unit_single_origin_chk`,
`partner_task_single_origin_chk`, `request_item_order_unit_qty_chk`,
`order_unit_single_origin_chk`). Adding a value to `asset_event.type` or
`attachment.entity_type` is a **TypeScript-only change**.

---

## 3. Minimum viable change

### Phase A — Initial Collection: **zero schema change**

Phase A is already built. What it needs is a reframing, not a table:

- The receipt is titled a *custody* document and already carries the
  preliminary-inspection clause and both signatures.
- `pending_inspection` is **derived, not stored**:
  `order_unit.status = "returned" AND no inspection row exists`.
  Storing it would duplicate `returned` and force a migration plus a
  state-machine edit for no information gain.
- Accessories and quantity already live on `request_item`
  (`accessories`, `quantity`); apparent condition on
  `signature_item_condition`; photos via `attachments(entityType="signature_request")`.

**Only change: none required.** Optionally add an admin "Pending inspection"
queue view — a filtered read, no schema.

### Phase B — Detailed Inspection: **one new table**

```
device_inspection
  id                  text pk
  assetId             text  → order_unit.id           (indexed)
  collectionRequestId text  → request.id  (nullable — legacy/ad-hoc inspections)
  requestItemId       text  → request_item.id (nullable)

  functionalResult    text  pending | passed | failed | unable_to_test   default 'pending'
  physicalCondition   text  good | worn | damaged | missing              default 'good'

  notes               text
  missingAccessories  text            -- free text, mirrors request_item.accessories
  resultingAction     text  return_to_stock | maintenance | customer_claim
                            | lost_review | manual_review                (nullable until decided)
  actionAppliedAt     integer         -- set only when the transition actually ran
  inspectedAt         integer
  inspectedBy         text  → users.id
  createdAt/updatedAt integer
```

Two independent axes, exactly as specified — a device can be
`functional=passed` + `physical=worn`, or `functional=unable_to_test` +
`physical=good`. Neither is derivable from the other, which is why one enum
cannot serve.

Evidence reuses `attachments` with a new `entityType` value
`"device_inspection"` — no new table, no migration for the enum itself.

**Clearance** is **derived**, not stored, from the inspection rows of one
collection request. Storing it would go stale the moment one device is
re-inspected. See §6.2.

### What NOT to build

- No `pending_inspection` asset status (duplicates `returned`).
- No new signature machinery — the inspection report is internal and needs at
  most a Kara-side sign-off, not a customer token.
- No new numbering counter — extend `buildDeliveryNoteName`.
- No inspection *workflow* engine. One row per device, one admin screen.

---

## 4. Is a migration required?

**Yes — exactly one, for the `device_inspection` table.** Next free number is
**0043** (journal has 43 entries, `0042_salty_bloodstorm` is the tip).

| Change | Migration? |
|---|---|
| `device_inspection` table + 2 indexes | **yes** — `0043_*` |
| `attachment.entity_type` += `device_inspection` | no (text, no CHECK) |
| `asset_event.type` += `inspected` | no (text, no CHECK) |
| Clearance decision | no — derived |
| `pending_inspection` state | no — derived |
| Phase A as a whole | no |

Additive only: one `CREATE TABLE`, no column drops, no rewrites of existing
tables, no backfill. Safe to apply to prod with zero downtime.

> ⚠️ **Numbering hazard.** `feat/ad-hoc-partner-task` carries its own colliding
> migration history, and incident `0022` came from applying migrations out of
> order. Generate `0043` only from a branch rebased on the merge target, and run
> `drizzle-kit check` before applying anywhere.

---

## 5. Transitions and guards

### 5.1 New asset action

One addition to `lib/domain/asset-status.ts`:

```
inspect_fail_to_claim:  from ["returned"] → "damaged"      # customer_claim
```

Everything else maps onto existing actions:

| resultingAction | existing transition | resulting status |
|---|---|---|
| `return_to_stock` | `restock` | in_stock |
| `maintenance` | `send_maintenance` | maintenance |
| `customer_claim` | `mark_damaged` | damaged |
| `lost_review` | `mark_lost` | lost |
| `manual_review` | *(none — deliberately)* | stays `returned` |

`manual_review` is the escape hatch: it records a decision to decide later
without forcing a status change. The device stays in the pending queue.

### 5.2 Guards

1. **Custody first.** An inspection may only be created for an asset at
   `status = "returned"`. Anything else means the device was never collected —
   reject, do not silently create.
2. **One open inspection per asset.** Partial unique index on
   `(assetId)` where `actionAppliedAt IS NULL`. Prevents two inspectors racing.
3. **No action while pending.** `resultingAction` cannot be set while
   `functionalResult = "pending"`. An undecided inspection cannot dispose of a
   device.
4. **`unable_to_test` cannot go to stock.** Allowed actions are `maintenance`
   or `manual_review` only. Returning an untested device to rentable inventory
   is the exact failure the preliminary clause was written to prevent.
5. **Transition through the chokepoint, in the same transaction.** Applying an
   action calls `applyAssetTransition` inside the same `db.transaction` as the
   inspection write — the OI-1 rule the whole codebase already follows. On
   `AssetTransitionError`, the whole thing rolls back and `actionAppliedAt`
   stays null.
6. **Applied is immutable.** Once `actionAppliedAt` is set, the row is
   read-only; a correction is a *new* inspection row, so the history survives.
7. **Role.** Creating/applying requires `getSessionWithRole("admin")`, matching
   every other asset-mutating action.

### 5.3 Derived pending queue

```
status = "returned"
AND asset has no device_inspection row with actionAppliedAt IS NOT NULL
```

---

## 6. Document shapes

### 6.1 Two documents, not one

| | Phase A | Phase B |
|---|---|---|
| Name | **Collection Receipt** / سند استلام | **Device Return & Inspection Report** / تقرير إرجاع وفحص الأجهزة |
| Number | `Collection Receipt #<order> …` (built) | `Inspection Report #<order>-R<n>` |
| Proves | custody moved customer → Kara | condition, and whether Kara is clear |
| Signed by | customer (captured) + Kara rep (wet) | Kara inspector; customer counter-signature only when the decision creates a claim |
| Given to customer | always, at the door | on request / when settlement is owed |
| Clears liability | **explicitly not** | yes, when `cleared` |

Keeping them separate is the point. A single merged report would either be
issued too early (before inspection, so it cannot clear anything) or too late
(the customer leaves with no proof they handed anything over).

### 6.2 Clearance Decision — derived

Computed in a pure module (`lib/domain/clearance.ts`), same shape as
`asset-status.ts` — no DB, unit-testable:

| Decision | Rule |
|---|---|
| `not_cleared` | any device still `pending` or `unable_to_test`, or any inspection un-applied |
| `pending_settlement` | all inspected, and ≥1 `customer_claim` or `lost_review` unresolved |
| `cleared_with_notes` | all inspected and settled, and ≥1 `worn` / `failed` / notes present |
| `cleared` | every device `passed` + `good`, all actions applied, nothing owed |

Evaluated in that order; first match wins. Deposit settlement (already built,
`DepositSettlement`) feeds `pending_settlement` — a deposit marked
`pending_refund` should not read as `cleared`.

### 6.3 Report contents

Header: report no, collection receipt no, order, customer, collected-on,
inspected-on, inspector. Then per device: serial, name, **functional result**,
**physical condition**, missing accessories, notes, evidence count, resulting
action. Then a summary band (counts per result), the **Clearance Decision** with
its reason, and the deposit settlement line. Signature: Kara inspector; customer
box only when the decision is `pending_settlement` or `not_cleared`.

---

## 7. Risks and legacy-data compatibility

| Risk | Severity | Mitigation |
|---|---|---|
| Historical `returned` assets have no inspection row → they all appear in the pending queue | **high, certain** | Queue filters on a go-live date; or accept a one-time backlog and triage it. Decide before shipping. |
| `signature_item_condition.condition` and `physicalCondition` overlap but differ (`missing` in both, `worn` only in the new one) | medium | They are records of *different moments* — apparent condition at the door vs. verified condition at the bench. Do not merge; the report shows both side by side, and a divergence is itself a finding. |
| Migration numbering collision with `feat/ad-hoc-partner-task` | **high** | §4 warning. `drizzle-kit check` before any apply. |
| Devices returned but never inspected sit in `returned` forever | medium | The queue is the control; consider an ageing indicator, not an automatic transition. |
| `manual_review` becomes a dumping ground | low | Report it separately in the queue; it is deliberately not a terminal state. |
| Photos are `sensitivity` = sensitive by default | low | Match the existing default; inspection photos of devices are `operational`. |

**Backwards compatibility is clean:** the table is new and additive, every
existing collection keeps working untouched, and the Phase-A receipt is
unchanged. A collection with no inspection rows simply has no report yet.

---

## 8. Scope boundary

This design covers KOPH. Two notes that constrain it:

- **Inspection is KOPH-only.** It has no counterpart anywhere else, so it starts
  clean — no reconciliation, no import, no dual-write question.
- **Field collection is not exclusively KOPH's yet.** Collections captured
  outside KOPH will not appear in the pending-inspection queue. That is expected,
  not a bug: the queue is derived from `order_unit.status`, and KOPH only knows
  about assets whose custody moved through KOPH. Do not build a sync for this
  now; decide it when collection ownership is settled.

Everything else in this document assumes KOPH is the asset ledger, which it
already is — `order_unit` + `asset_event` are uncontested.

---

## Recommended sequence

1. **Now:** merge `feat/asset-rename`, then `feat/collection-receipt`. No new work.
2. **Next (small, no migration):** derived pending-inspection queue in KOPH.
3. **Then (one migration, 0043):** `device_inspection` + the report + clearance.
