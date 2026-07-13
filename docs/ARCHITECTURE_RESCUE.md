# KOPH Architecture Rescue

**Date:** 2026-07-13 · **Status:** First-principles review, grounded in the actual code (schema, actions, domain layer, routes — all traced, nothing assumed)

> Success metric: after reading this, you can explain the entire system on a whiteboard from memory.

---

## 0. The One-Sentence Mental Model

**KOPH is a system that moves devices: it buys them from suppliers, delivers them to customers, gets them back, and pays the couriers who moved them.**

Everything else — sourcing, signatures, warranties, batches, portals — is scaffolding around those four movements.

The single object that owns the business is the **Device** (in the code: `order_unit`, badly named — see §9). Every flow either **creates** a device, **moves** a device, **fixes** a device, or **pays for the movement** of a device.

```
MONEY IN                    THE DEVICE                    MONEY OUT
Customer Order  ──rent──▶  ┌──────────┐  ◀──buy── Purchase Order (supplier)
                           │  ASSET    │
Request/Task    ──move──▶  │(order_unit│  ◀──fix── Maintenance / Warranty
                           └──────────┘
Partner Payment ◀──pay the mover──┘
```

If you remember only this diagram, you can re-derive the rest of the system.

---

## 1. Business Model (plain English)

KARA is a **Device-as-a-Service rental company** in Saudi Arabia. A corporate customer signs a rental quote (e.g. "50 laptops for 12 months"). KARA:

1. **Wins the deal** — a sales quotation becomes an **Order** (the commercial contract).
2. **Buys the devices** — procurement finds suppliers, compares quotes, gets approval, issues a purchase order (the PO itself lives in the ERP — Zoho/Odoo; KOPH tracks the decision trail and the receiving).
3. **Receives the devices** — each physical unit becomes an **Asset** with a serial and a KARA tag, optionally QC'd.
4. **Delivers them** — an operations **Request** is created, assigned to a courier **Partner** via a magic link, the customer signs a delivery note on a phone, the asset is now "delivered" at the customer.
5. **Services them** — swaps, collections, maintenance, warranty claims over the rental period.
6. **Pays the partners** — each completed task earns the partner money per their contract; monthly **payment batches** go to finance.

KOPH does **not** do: invoicing customers, accounting, HR. That's the ERP. KOPH is the **operations and partner hub** — the physical-world layer.

---

## 2. Core Business Objects

There are only **9 objects that matter**. Everything else is a detail row, a config table, or plumbing.

| # | Object | Table | Why it exists | Created by | Owned/updated by | Closed by |
|---|--------|-------|---------------|-----------|------------------|-----------|
| 1 | **Customer** | `customer` (+`customer_contact`) | Who we rent to; contacts = who receives/signs | Sales/admin | Admin | Soft-delete |
| 2 | **Supplier** | `supplier` | Who we buy from | Procurement | Procurement | Soft-delete |
| 3 | **Partner** | `partner` (+`partner_contract`) | Who physically moves devices; contract = how they're priced | Ops | Ops | Deactivate |
| 4 | **Order** | `order` (+`order_line`) | The commercial contract from the accepted quote. Money-in anchor. | Sales/admin | Sales | `fulfilled`/`cancelled` |
| 5 | **Asset** | `order_unit` (+`asset_event`) | The physical device. THE central object. Has the only long-lived state machine. | Receiving (from PO) or direct entry (from Order) | Every module transitions it — through ONE chokepoint (`applyAssetTransition`) | `retired`/`sold` |
| 6 | **Sourcing→PO chain** | `sourcing_request`…`procurement_case`, `purchase_order` (+lines) | The decision trail "which supplier, what price, who approved" + the receiving contract | Procurement | Procurement/finance | PO `received`; case `closed` |
| 7 | **Request** | `request` (+`request_item`) | A unit of field work for a customer: deliver / collect / swap / install | Ops | Ops (status is **derived** from its tasks) | `completed`/`failed`/`cancelled` |
| 8 | **Task** | `partner_task` (+proofs, signatures) | The assignment of a Request (or supplier pickup) to a Partner, executed via magic link | Ops | Partner (via token) then Ops (sign-off) | Ops sign-off → `closed` |
| 9 | **Partner Payment** | `partner_payment` → `payment_batch` | Money owed for a closed task; batch = monthly statement to finance. Money-out anchor. | **System** (auto on task sign-off) | Finance | Batch `paid` |

**Dependency direction (this is the whole graph):**

```
Customer ◀── Order ◀── Sourcing chain ──▶ Supplier
   ▲            │              │
   │            ▼              ▼
   │      ┌── ASSET ◀── Purchase Order
   │      │     ▲
Request ──┘     │ (transitions)
   │            │
   ▼            │
 Task ──────────┘
   │
   ▼
Partner Payment ──▶ Payment Batch
   │
   ▼
 Partner
```

Remove **Asset** → everything breaks. Remove **Sourcing chain** → you can still run the business with manual POs (the code already supports this: `source="system_manual"`). Remove **Order** → requests and assets still work (order linkage is optional). That asymmetry tells you what's core and what's elaboration.

---

## 3. Single Source of Truth — findings

The good news: the codebase already **states** its ownership rules in schema comments, and mostly enforces them. The violations are few and specific:

| Data | Rightful owner | Violation found |
|------|---------------|-----------------|
| Asset status | `applyAssetTransition` (lib/actions/asset-transition.ts) — validated, CAS-guarded, event-writing chokepoint | ✅ Mostly respected. ❌ `saveOrderUnits` (orders.ts) inserts new units **directly at `in_stock`, bypassing `createAssetCore`** — those assets get no `created` event, no `AssetCreated`. Second, quieter asset birth path. |
| Asset creation | `createAssetCore` (assets.ts:375) | ❌ Same bypass as above. Also open follow-up task_860b5b08 (unguarded path). |
| Request status | `deriveRequestStatus` (lib/domain/request-status.ts) | ❌ Duplicated: `resumeRequest` (requests.ts:385) hand-rolls a near-identical copy. Comment admits it. Drift bomb. |
| Signature request creation | `createSignatureRequest` | ❌ `signOnSiteByTaskToken` auto-creates one with **different defaults** (requireNationalId forced true, born `sent` not `draft`). Two birth paths, two behaviors. |
| Task cancellation cascade | should be one function | ❌ The "cancel live task links" block is copy-pasted in `updateRequestStatus`, `deleteRequest`, and `cancelTask`. |
| Payment month bucketing | one function | ⚠️ `getBusinessMonthOffsetModifier` used in two places (list + generate); safe today, fragile. |
| Authorization idiom | one seam | ❌ Two parallel idioms: `getSessionWithPermission` (return-null) vs older throwing `requireRole` with inline role union. |
| Outbox idempotency | `dedupeKey` = deterministic | ❌ Task/request events append `createId()` to the dedupe key — every emit is unique, defeating the idempotent-emit design for those events. |
| "What items are being delivered" | — | ❌ **Three copies of the same description**: `order_line.description`, `request_item.description`, and the asset itself. `request_item` re-enters brand/model/serial as free text even when `orderUnitId` is set. |

**Rule to adopt:** an entity has exactly one **birth function** and one **transition function**. Any other write path is a bug, even if convenient.

---

## 4. Complete Lifecycles (trigger → objects → states → outcome)

### 4a. Procurement (buy devices)
```
Sales wins deal / stock low
  ↓ createSourcingRequest        sourcing_request(draft) + items(pending)
  ↓ sendSupplierRfqs             supplier_rfq(sent) per supplier · items→rfq_sent · req→rfq_sent
  ↓ submitSupplierQuotation      quotation(submitted)+lines · items→quoted · req→quotes_received
  ↓ awardSourcingItems           evaluation(active)+lines (per-item winner + reason) · req→under_evaluation
  ↓ decideCommercialApproval     approval(approved) — append-only · req→approved
  ↓ handoffToProcurementCase     one procurement_case(open) PER SUPPLIER · req→handed_off
  ↓ linkExternalPo               ERP (Zoho/Odoo) makes the real PO · case→po_linked
  ↓ createPurchaseOrderFromCase  purchase_order(ordered)+lines   [manual POs skip everything above]
  ↓ (optional) pickup task       partner_task(kind=supplier_pickup): pending→accepted→arrived→picked_up
  ↓ receivePurchaseOrderLine     guarded qty increment → createAssetCore → ASSET born
                                 (receiving_qc if QC required, else in_stock) · pickup task auto-closes
  ↓ qcAsset                      receiving_qc → in_stock | damaged
FINAL: PO received · case closed · N assets in stock
```

### 4b. Delivery (the money flow)
```
Customer PO / delivery date agreed
  ↓ createRequest        request(draft) + request_items; items with orderUnitId
                         → applyAssetTransition "assign" (in_stock→assigned), same tx
  ↓ createTask           partner_task(pending) + magic-link token → partner notified · request→assigned
  ↓ partner via /task/[token]:  accept→accepted · start→in_progress · request→in_progress
  ↓ on-site signature    stage 1: receiver signs (/sign/[token]) → signature signed
                         stage 2 (if receiver not authorized): requestAuthorizedSignoff → child sig → signed
  ↓ mark_done            task→pending_signoff (photo count enforced)
  ↓ signOffTask (Ops)    proof gate → task→closed · assets: assigned→delivered
                         · partner_payment(pending) auto-created · request→completed
FINAL: devices at customer · delivery note signed · partner owed money
```

### 4c. Collection / Swap — same skeleton as 4b; sign-off transitions assets `delivered→returned` (collection) or does both (swap). One flow, parameterized by request type. This is the design's best move.

### 4d. Maintenance
```
Issue found → openMaintenanceOrder: maintenance_order(open) + asset→maintenance
→ in_progress → closeMaintenanceOrder(done): asset→in_stock
⚠️ closeMaintenanceOrder(cancelled): asset STAYS in maintenance — orphaned state, admin must remember to fix manually
```

### 4e. Warranty — `warranty_product` (catalog) → `warranty_batch` (purchased pool) → `assignWarrantyCore` (assigned_not_activated) → `activateWarranty` (active, computes end date). Never touches asset status. Clean, isolated.

### 4f. Partner payments
```
signOffTask → partner_payment(pending)          [system-created, never manual]
→ generateBatch(partner, month) → payment_batch(draft) · payments→batched · statement token minted
→ approveBatch → sent_to_finance → paid (payments→paid)
holds: payment ⇄ on_hold (pulled out of batch, total recalculated)
```

### 4g. Returns/failure — task `mark_failed` (+reason from `failure_reason` table) → request `failed`; assets stay `assigned` until Ops decides (unassign or reschedule).

---

## 5. State Machines — audit

| Entity | States | Verdict |
|--------|--------|---------|
| **Asset** | 11: receiving_qc, in_stock, reserved, assigned, delivered, returned, maintenance, damaged, retired, sold, lost | Core machine, well-guarded. **Cut 2**: `reserved` (unused shadow of `assigned` — requests assign directly) and `returned` (it's a transient; a returned device is either `in_stock` after check-in or `damaged`/`maintenance`. Today it's a second "in warehouse but not rentable?" limbo). 9 states suffice. |
| **Task** | 10 across two kinds | **Split it.** `pending/accepted/in_progress/pending_signoff/closed/rejected/failed/cancelled` for requests + `arrived/picked_up` grafted on for pickups, with every action function containing `if kind===supplier_pickup throw`. Two machines wearing one table. See §10. |
| **Request** | 8, mostly **derived** from tasks | Derivation is right. **Cut** `rescheduled` and `on_hold` as stored statuses — they're annotations, not states (a rescheduled request is a draft/assigned request with a new date). 5 suffice: draft, assigned, in_progress, completed, failed/cancelled. |
| **Sourcing request** | 9 | `handed_off` vs `closed` vs `approved` blur. 6 suffice: draft → rfq_sent → quoted → awarded → approved → done/cancelled. `quotes_received` vs `under_evaluation` is UI, not state. |
| **Procurement case** | 6 (open/handed_off/po_linked/closed/cancelled/superseded) | The case is 1:1 with a PO (unique index!). Its states shadow the PO's. Candidate for merging into PO — see §9. |
| **Signature** | 8 | Fine. `otp_verified` unused-ish, keep if OTP planned. |
| **Payment batch / payment** | 4 + 4 | Clean. Keep. |
| **Warranty** | 7 incl. `unknown` | `unknown` and `activation_pending` earn their keep only if ops actually uses them; likely 5 suffice. |
| **Order** | 5 | Fine, but `partially_fulfilled/fulfilled` are derivable from units — don't store. |

**Principle violated repeatedly:** storing what can be derived (order fulfillment, request status in one path, item "selected" state — which sourcing V2 got right by deriving). **Rule: if a status can be computed from children, never store it.**

---

## 6. Entity Relationship Map (complete, memorizable)

```
                     CONFIG: request_type · failure_reason · services_catalog
                             app_setting · consent_version · warranty_product
─────────────────────────────────────────────────────────────────────────────
 PARTIES        customer ─┬─ customer_contact
                supplier  │        partner ── partner_contract
                          │
 MONEY-IN       order ── order_line
                          │ (origin A)
 SUPPLY         sourcing_request ── items ── rfq ── rfq_items
                     │                        └─ quotation ── quotation_lines
                     └ evaluation ── eval_lines ── approval
                            └──▶ procurement_case ──1:1── purchase_order ── po_lines
                                                                  │ (origin B)
 THE CENTER                    ┌──────────────────────────────────┘
                order_unit (ASSET) ── asset_event (timeline)
                     ├── warranty_assignment ── warranty_batch
                     ├── maintenance_order
                     └── accessory_attachment (accessory_item/unit/stock — parallel mini-inventory)
 WORK           request ── request_item (→ orderUnitId)
                   └── partner_task ── task_service ── pickup_task_line (pickup kind)
                            ├── signature_request ── customer_signature · signature_event
                            │        └── signature_item_condition
                            └── attachments (photos)
 MONEY-OUT      partner_payment ── payment_batch
 PLATFORM       domain_event ── event_delivery (outbox → notifications/notion)
                notification · activity_log · attachment
                users/session/account + 6 token types (task, sign, portal,
                statement, activation, invite)
```

Count: ~55 tables. Of those, **~20 carry business state**; the rest are lines, events, config, or auth plumbing. The cognitive load problem is not table count — it's that the 20 aren't presented in these 6 layers anywhere. (Now they are.)

---

## 7. Navigation Map

Admin sidebar today (17 items, flat):
dashboard · orders · assets · sourcing · procurement · warranty · accessories · maintenance · requests · customers · suppliers · partners · signatures · payments · reports · users · settings

**Why each exists / issues:**

- **17 flat items = no story.** The nav should read like §6's layers. Proposed grouping (same pages, zero code moved):
  - **Work** (daily): Dashboard · Requests · Signatures
  - **Devices**: Assets · Accessories · Maintenance · Warranty
  - **Supply**: Sourcing · Procurement (+ Receiving surfaced here — today `procurement/receiving` is unreachable from nav)
  - **Commerce**: Orders
  - **People**: Customers · Suppliers · Partners
  - **Money**: Payments · Reports
  - **System**: Users · Settings
- **Dead end:** `/admin/procurement/receiving` not in nav.
- **Overlaps:** role config in both `/settings/roles` and `/users`; global `/admin/search` vs per-list filters (fine, keep one global); signatures reachable from three surfaces (list, per-request, `/verify/[id]` — the verify page is a public proof page, that's legitimate).

**External surfaces (all token-gated, all correct as designed):**
`/task/[token]` partner · `/sign/[token]` customer signs · `/client/[token]` customer portal · `/statement/[token]` partner statement · `/activate` `/invite` onboarding · `/verify/[id]` public signature proof.

---

## 8. User Journeys (a new employee's day)

- **Sales/Commercial:** Create Customer → create Order from the accepted quote → (if stock missing) create Sourcing Request tied to the order → watch order journey stage. Done.
- **Procurement:** Inbox = sourcing requests. Send RFQs → enter quotations → award per item with a reason → get approval → hand off → make the PO in the ERP → link it back → create the KOPH PO. Manual small buys: just create a PO directly.
- **Warehouse:** Inbox = `procurement/receiving`. Receive units (serials) → assets are born → QC pass/fail. On collections: confirm returned devices back to stock.
- **Operations (the cockpit role):** Inbox = Requests. Create request (pull units from an order) → assign partner task → watch magic-link progress → when `pending_signoff`, verify photos + signature → sign off. Handle failures/reschedules. Ops sign-off is the **single moment** money-out, asset movement, and request completion all fire — that's the system's heartbeat.
- **Partner (no login needed):** Open magic link → accept → start → do the job → capture customer signature on-site → upload photos → done. Monthly: open statement link.
- **Finance:** Monthly: generate batch per partner → approve → send to finance → mark paid. Handle holds. Also: commercial approvals in sourcing.
- **Admin:** Users, invites, settings, config tables.

Each role has **one inbox**. That's already true in the data — the UI just needs to say it.

---

## 9. Complexity Audit — what makes you feel lost, and why

Ranked by cognitive damage:

1. **`order_unit` is the central object with the wrong name.** It's the Asset — the star of the whole system — but it's named as if it were a detail row of Order, lives in the schema between order tables, and half its rows have no order at all (PO-origin). Every time you read the schema, your mental model gets corrupted by this name. *One rename fixes more confusion than any refactor.*
2. **The word "order" means three things**: `order` (customer rental), `purchase_order` (supplier buy), `order_unit` (device). And "request" means two: `request` (field work) and `sourcing_request` (procurement need). Reading any sentence about the system requires disambiguation. Vocabulary is architecture.
3. **The sourcing chain is 10 tables to answer one question** ("which supplier won, at what price, who approved?"), and it terminates in `procurement_case`, which is **1:1 with `purchase_order`** (DB-enforced!). Two objects, one identity. The case exists only because the ERP owns the real PO in the middle — but a nullable `erp_po_ref` on the PO says the same thing.
4. **Duplicated item descriptions** (order_line / request_item / asset) — you must re-type what a laptop is at each layer, and they drift. Symptom: three "description" columns for one device.
5. **Task table hosts two state machines** (request vs supplier_pickup) with runtime `if kind` guards in every function, plus a check constraint, plus a parallel line table. Cost: every task function must know about pickups even though pickups are a warehouse concern.
6. **Statuses stored where they should be derived** (order fulfillment, one request-status path, `on_hold/rescheduled`).
7. **Accessories = a fourth parallel inventory** (item/unit/stock/attachment) with its own status enum, for the same physical concept as Asset ("a thing we own, at a location, in a state"). Justifiable for non-serialized qty, but serialized accessories are just assets.
8. **Two auth idioms, six token types**, each with its own column, TTL rule, and expiry story — same pattern implemented six times.
9. **Config tables no one remembers** (`services_catalog`/`task_service` checklist — used? `consent_version` — one row forever). Each is small; together they widen the schema you must hold in your head.
10. **Domain layer exists but isn't sovereign** — `lib/domain/` correctly holds the state machines, but actions occasionally re-implement them (`resumeRequest`) or bypass them (`saveOrderUnits`). A rule that isn't enforced everywhere isn't a rule; it's a suggestion.

**Why this happened (no blame, just physics):** each milestone (M1→M4.5, Sourcing V2, pickups) added a locally-correct vertical slice. Nobody was assigned to the horizontal layer — the vocabulary, the layer map, this document. Features compounded; the model didn't.

---

## 10. Simplification Plan (if KOPH started today)

Five modules, five words:

```
PEOPLE     customers, suppliers, partners (+contacts/contracts)
DEVICES    asset + asset_event         ← the center, owns the only big state machine
DEALS      order (money-in) · purchase (money-out, absorbs procurement_case)
           sourcing (one table + items + quotes; award/approval = columns/rows on it)
JOBS       job (= request) → assignment (= task) → proof (photos+signature)
           two job categories: customer job, warehouse pickup — separate tables
MONEY      partner_payment → batch    (auto-created, never hand-made)
```

Design rules (the constitution — these matter more than the table list):
1. **One birth function, one transition function per entity.** No second path, ever.
2. **Never store what you can derive.** Parent statuses roll up from children at read time.
3. **One name = one concept.** Asset. Order. Purchase. Job. If a new feature needs a new noun, that's a design review, not a migration.
4. **The domain layer owns rules; actions own orchestration; pages own nothing.**
5. **Every external actor enters via one `magic_link` table** (entity_type, entity_id, token, ttl, single_use) — one implementation of mint/verify/expire instead of six.
6. **ERP boundary stays exactly where it is** (KOPH: need→decision→receiving + all field ops; ERP: PO/billing/accounting). This boundary is one of the current design's genuinely good calls.
7. **Outbox stays** (it's good) — but dedupe keys must be deterministic, and consumers registered in one place (already true).

Table count under this model: ~35 (from ~55), states cut per §5, and — more important — the schema file reads in the same order as the whiteboard.

---

## 11. Version 2 Blueprint — what to actually do

**Do not rewrite.** The system's bones are good: the asset chokepoint, the derived request status, the outbox, the proof gate, the magic-link pattern, the ERP boundary, append-only commercial records, 200+ tests. The failure is *presentation and vocabulary*, plus a short list of real defects. A rewrite would re-earn all the hard-won invariants in your memory files for zero business value.

Instead: **three waves, each shippable, none blocking operations.**

### Wave 1 — Clarity (days, no schema change)
1. This document lives in the repo; update it every milestone. It IS the architecture.
2. Regroup the sidebar into the 7 groups of §7. Surface Receiving.
3. Rename in **code only** (TS aliases/exports, keep table names): `order_unit → Asset` everywhere in application code (`lib/domain/asset.ts` already aliases it — finish the job), `sourcing_request → SourcingCase` in UI copy.
4. Kill the duplicates: single `deriveRequestStatus` call in `resumeRequest`; single cancellation-cascade function; single signature-creation core with an options param; one auth idiom (`getSessionWithPermission`); deterministic dedupe keys.

### Wave 2 — Correctness (1–2 weeks)
5. Route `saveOrderUnits` through `createAssetCore` (kills the silent asset-birth path; also closes task_860b5b08).
6. `closeMaintenanceOrder(cancelled)` must transition the asset out of `maintenance`.
7. Stop storing derivable status: compute order fulfillment from units; make `on_hold`/`rescheduled` annotations.
8. Deprecate asset states `reserved` + `returned` (migrate rows to `assigned`/`in_stock`).

### Wave 3 — Structure (when a related feature forces you there, not before)
9. Merge `procurement_case` into `purchase_order` (nullable `erp_system`/`erp_po_ref`/`sourcing_request_id` columns; supersede = new PO row). Deletes one entity, one status machine, one nav concept.
10. Split `partner_task` into `job_assignment` (customer work) and `pickup_task` (warehouse work). Removes every `if kind` guard and the check constraint.
11. Collapse sourcing detail: fold `evaluation + evaluation_lines + approval` into award columns on `sourcing_request_item` (+ append-only `sourcing_decision` rows). 10 tables → 6.
12. Unified `magic_link` table; migrate the six token columns as they next need touching.
13. Serialized accessories become assets (category field); keep qty-stock table for cables/mice.

### The whiteboard test (memorize exactly this)

```
PEOPLE:  Customer   Supplier   Partner
FLOW:    Order ──need──▶ Sourcing ──decision──▶ Purchase ──receive──▶ ASSET
         ASSET ──job(deliver/collect/swap)──▶ Assignment ──proof──▶ Sign-off
         Sign-off = the heartbeat: asset moves + request completes + partner payment born
MONEY:   in: Order (ERP bills)     out: Payment → Batch → paid
STATES:  only the Asset has a rich lifecycle; everything else is
         draft → active → done, or derived from children
PLATFORM: every state change → outbox event → notifications/Notion
          every outsider → magic link      every change → activity log
```

Six lines. That's KOPH.
