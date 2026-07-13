# KOPH Experience Redesign — Implementation Specification

**Date:** 2026-07-13 · Final spec before code. Scope: UI/UX recentering on the Customer Request. **No schema merges/deletes.** Additive columns only where a feature is impossible without one (each flagged ⚠️ and justified).

---

## 0. Anchor decision (the one naming resolution this spec makes)

The business's "Customer Request" = today's **`order` table**. It already holds: customer, quote number (= request number, e.g. 10669), lines (requested items + quantities), rental terms, and the journey (`lib/domain/order-journey.ts` derives stages from it today). Nothing else in the schema spans pre-sales → closure.

Vocabulary mapping (UI labels change; table names do not):

| UI term (en / ar) | Table | Today's UI label |
|---|---|---|
| **Request / الطلب** | `order` | "Order" |
| **Job / مهمة ميدانية** | `request` | "Request" (!) |
| **Task** | `partner_task` | Task (unchanged) |
| **Purchase / أمر شراء** | `purchase_order` (+case, hidden) | Procurement |
| **Sourcing / التسعير** | `sourcing_request` | Sourcing |

The label swap (`order`→Request, `request`→Job) is the single highest-risk rename; it is done **everywhere at once in i18n files + routes**, never partially, so the UI never shows both meanings of "Request" simultaneously.

---

## 1. Request Mission Control — `/admin/requests/[id]` (new home of order detail)

### Layout (desktop)
```
┌─ STICKY HEADER (always visible, all scroll positions) ──────────────────────┐
│ Request #10669 · Al-Rajhi Bank · 20 items · rental 12mo (ends 2027-07-01)   │
│ [✓Requested]─[✓Sourcing]─[✓Purchasing]─[●Receiving 12/20]─[Ready]─[Delivery]│
│  ─[Active]─[Collection]─[Closed]                                            │
│ OWNER: Warehouse · BLOCKER: 8 units not yet received (PO-0042)              │
│ ▶ NEXT ACTION: [Receive units — PO-0042]      (one button per active track) │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ TABS (content area, one visible at a time) ────────────────────────────────┐
│ Overview │ Buying │ Devices │ Jobs │ Documents │ Money │ Timeline           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tab contents (all read from existing tables; no new queries beyond joins that exist in actions)
- **Overview**: customer + contacts, requested lines w/ fulfillment bar per line (qty requested / sourced / received / delivered — derived), rental terms, notes.
- **Buying**: sourcing requests linked via `sourcing_request.orderId` → their items, RFQs, quotations (comparison view reused from sourcing detail), evaluation/awards, approvals, procurement cases (shown as "ERP reference" rows, the word "case" never rendered), purchase orders + line receiving progress. Each sub-block collapsible, collapsed when done.
- **Devices**: `order_unit` rows where `orderId` = this, plus PO-origin units received against linked POs; serial, tag, status chip, current location; final delivered configuration (item `customerDescription`).
- **Jobs**: field `request` rows joined by customer + items pulling this order's units (existing `request_item.orderUnitId` join); each with partner task status, partner name.
- **Documents**: signed delivery notes, signature statuses, attachments (existing per-entity queries, filtered to this request's jobs).
- **Money**: partner payments born from this request's jobs; batch status.
- **Timeline**: `activity_log` + `domain_event` rows across the whole family (order, linked sourcing, POs, jobs, tasks, signatures) merged chronologically. One query per entity type, merged in the server action.

### Files
- `app/admin/requests/[id]/page.tsx` — server component; one aggregate action `getRequestWorkspace(orderId)` in `lib/actions/request-workspace.ts` (new, read-only, composes existing queries).
- `components/request-workspace/` — `WorkspaceHeader.tsx` (sticky), `JourneyBar.tsx`, `NextActionButton.tsx`, `tabs/*.tsx`.
- Extend `lib/domain/order-journey.ts` → 9 stages: `requested, sourcing, purchasing, receiving, ready, delivery, active, collection, closed` (pure function + tests; facts extended with receivedCount, deliveredCount, collectionJobCount, rentalEnd).

---

## 2. Next Action Engine

Pure function: `lib/domain/next-action.ts`
```ts
deriveNextActions(facts: WorkspaceFacts): NextAction[]
type NextAction = {
  key: string            // stable id, i18n key
  ownerRole: "procurement" | "warehouse" | "ops" | "finance" | "admin"
  blockedBy?: string     // i18n key explaining the blocker, if external (e.g. awaiting ERP)
  href: string           // where the button goes (deep link, pre-filled)
  urgency: "now" | "soon" | "scheduled"
  entityRef: { type: string; id: string } // what it acts on
}
```
Multiple actions may be active in parallel (e.g. receiving PO-A while delivering PO-B's units); header shows the highest-urgency one per track; the rest appear in the relevant tab.

### The rule table (exhaustive; each row = state → action → owner → destination → pre-fill)

| # | Condition (derived from existing data) | Action label | Owner | Destination (pre-filled) |
|---|---|---|---|---|
| 1 | order confirmed ∧ line qty > sourced+stock-assigned | **Source items** | procurement | `/admin/sourcing/new?orderId=X` → form pre-fills items from order_lines |
| 2 | sourcing draft w/ items | **Send RFQs** | procurement | sourcing detail, RFQ section open |
| 3 | RFQ sent ∧ no quotation | **Record supplier quotation** (per RFQ) | procurement | quotation form, RFQ preselected |
| 4 | quotations exist ∧ no active award | **Award items** | procurement | comparison view |
| 5 | award active ∧ no approval | **Approve supplier selection** | finance/admin | approval dialog |
| 6 | approved ∧ not handed off | **Hand off to purchasing** | procurement | one click (existing action) |
| 7 | case open ∧ no ERP ref | **Add ERP PO reference** ⛔blocker card: "waiting on Zoho/Odoo PO" | procurement | inline field on Buying tab |
| 8 | case po_linked ∧ no KOPH PO | **Create purchase order** | procurement | `createPurchaseOrderFromCase` one click |
| 9 | PO ordered ∧ readyForPickup ∧ no pickup task | **Assign supplier pickup** (optional path) | ops | pickup task form, PO preselected |
| 10 | PO line qtyReceived < qtyOrdered | **Receive devices** | warehouse | `/admin/procurement/receiving?po=X` |
| 11 | units in receiving_qc | **QC devices** | warehouse | QC list filtered to this PO |
| 12 | units in_stock for this order ∧ undelivered ∧ no open delivery job covering them | **Create delivery job** | ops | `/admin/jobs/new?orderId=X&units=…` — customer, contact, items pre-filled from units |
| 13 | job draft, no task | **Assign partner** | ops | task form inside job |
| 14 | task pending_signoff | **Review proof & sign off** | ops | task sign-off panel |
| 15 | receiver signed ∧ receiver not authorized ∧ no stage-2 sig | **Request authorized signature** | ops | one click (`requestAuthorizedSignoff`) — auto-suggested, never remembered |
| 16 | task failed | **Handle failed job** (reschedule/cancel) | ops | job detail |
| 17 | rentalEnd − today ≤ 30d ∧ delivered units ∧ no collection job | **Schedule collection** | ops | `/admin/jobs/new?orderId=X&type=collection&units=…` pre-filled with delivered units |
| 18 | task closed ∧ payment pending ∧ month closed | **Generate payment batch** | finance | `/admin/payments?partner=Y&period=M` |
| 19 | batch draft | **Approve batch** | finance | batch detail |
| 20 | all units returned/retired ∧ jobs closed | **Close request** | ops | one click → order `fulfilled` |

Blockers (#7-style) render as a distinct amber card: what's waited on, since when, who owns it. Waiting time = now − relevant `updatedAt` (no new columns).

---

## 3. Role Inboxes — `/admin/dashboard` rebuilt as Home

`lib/actions/inbox.ts` — one action `getInbox(role)` returning `InboxCard[]`:
```
Card = { requestRef, customer, waitingWhat (i18n), waitingSince, owner, blocker?, primaryAction: NextAction }
```
Sections by role (staff see their sections first, others collapsed — roles today are admin/finance/viewer; the finer ops/warehouse/procurement grouping is presentational until real roles exist):

| Inbox | Cards (query source) |
|---|---|
| **Procurement** | sourcing awaiting quotes (rule 3) · awaiting award (4) · awaiting ERP ref (7) · case→PO pending (8) |
| **Warehouse** | expected receipts (10) · QC queue (11) · returns to check in (jobs of type collection closed w/ units still `assigned`) |
| **Operations** | ready-to-deliver (12) · unassigned jobs (13) · pending sign-off (14) · stage-2 signature needed (15) · failed tasks (16) · rentals ending ≤30d (17) |
| **Finance** | approvals pending (5) · unbatched payments per partner (18) · batches in flight (19) |
| **Admin** | dead-letter events (`event_delivery.status=dead`) · expiring invites/activations · stalled requests (no activity > N days, `app_setting` key `stalledRequestDays`, default 7) |

Every card's primary button = the same `NextAction.href` from §2 — single source of truth, no separate inbox logic.

Cron additions (`app/api/cron/`): reuse `weekly-summary` slot or extend drain cron to emit `RentalExpiringSoon` notification events (existing outbox path) — query only, no schema.

---

## 4. Forward-Only Workflow (pre-fill contract)

Every create-form accepts URL params and locks the pre-filled context (shown as a breadcrumb chip "for Request #10669", not re-selectable):

| Form | New params | Pre-fills |
|---|---|---|
| `/admin/sourcing/new` | `orderId` | items from order_lines (customer+supplier description seeded from line description), externalRef=orderNumber |
| `/admin/jobs/new` (today `/admin/requests/new`) | `orderId`, `unitIds`, `type` | customer, contact, items w/ orderUnitId, request type |
| `/admin/procurement/receiving` | `po` | PO filter applied |
| Pickup task form | `poId` | supplier, destination, lines |
| Payment batch form | `partner`, `period` | both |

After every completing server action, `redirect()` back to `/admin/requests/[orderId]` (when the entity has an order link) with a toast + advanced journey bar; otherwise to the module list.

---

## 5. Navigation Redesign

### Sidebar (final; `nav-items.ts` gets `group` field; sidebar renders group headers)
```
(no group)   Home        /admin/dashboard
WORK         Requests    /admin/requests        ← order list + mission control
             Jobs        /admin/jobs            ← moved field-work module
DEVICES      Devices     /admin/assets          (tabs on detail: Maintenance·Warranty·Accessories)
             Maintenance /admin/maintenance     (worklist)
             Warranty    /admin/warranty        (worklist)
             Accessories /admin/accessories     (worklist)
SUPPLY       Sourcing    /admin/sourcing
             Purchasing  /admin/procurement
             Receiving   /admin/procurement/receiving   ← NOW IN NAV
PEOPLE       Customers   /admin/customers
             Suppliers   /admin/suppliers
             Partners    /admin/partners
MONEY        Payments    /admin/payments
             Reports     /admin/reports
SYSTEM       Signatures  /admin/signatures      (archive worklist, demoted position)
             Users       /admin/users (adminOnly)
             Settings    /admin/settings
```
Mobile bottom nav: **Home · Requests · Jobs · Devices** + more-drawer.

### Routes & redirects (deep links preserved)
| Old | New | Mechanism |
|---|---|---|
| `/admin/requests`, `/admin/requests/new`, `/admin/requests/[id]` (field work) | `/admin/jobs/...` | folder move; old paths → `next.config.ts` redirects are impossible (id collision with new requests). Instead: `/admin/requests/[id]/page.tsx` looks up id — if it's a field-request id → `redirect(/admin/jobs/[id])`; if order id → workspace. `/admin/requests/new` → redirect `/admin/jobs/new` preserving params. List `/admin/requests` = order list (old bookmark to field list acceptable break: shows new Requests list with a one-time banner "Field jobs moved to Jobs"). |
| `/admin/orders`, `/admin/orders/[id]`, `/admin/orders/new` | kept working | `redirect()` to `/admin/requests[...]` equivalents |
Notification/inbox `linkUrl`s in existing rows keep resolving via the id-sniffing redirect above.

---

## 6. Mobile UX Audit & Fixes

Method (per page, via in-app browser on dev server):
1. Viewports 360×800, 390×844, 430×932 × {en-LTR, ar-RTL} = 6 passes per page.
2. Checklist per pass: no overlap · no clip · no horizontal scroll · font ≥ 14px body / line-height ≥ 1.4 · tap targets ≥ 44px · forms stack · tables → card layout or intentional scroll container · sticky bars never cover content or the Next Action · dialogs/dropdowns inside viewport · RTL alignment/mirroring correct.
3. Screenshot before → fix → screenshot after. Stored `docs/mobile-audit/{page}-{viewport}-{locale}-{before|after}.png`.

Page list (priority order): Home/inboxes · Request Mission Control · Jobs list/detail/new · `/task/[token]` partner page · `/sign/[token]` · proof upload · receiving · sourcing detail + quotation form · procurement detail · devices list/detail · payments/batch · statement page · settings forms · dialogs/dropdown components (shared).

Standard fixes (applied as shared patterns, not per-page hacks): tables get a `MobileCardList` alternative (pattern already exists from the 2026-07-08 mobile card sweep — extend it, don't fork it); dialog content `max-h-[85dvh] overflow-y-auto`; sticky action bar component with `pb-safe`; form grids `grid-cols-1 sm:grid-cols-2`; RTL via logical properties (`ms-/me-/ps-/pe-`) replacing any `ml-/mr-` still present.

---

## 7. Implementation Phases (each independently shippable & deployable)

| Phase | Contents | Risk |
|---|---|---|
| **P1** | Journey extension (9 stages) + Next Action engine (pure domain + tests) + `getRequestWorkspace` + Mission Control page at `/admin/orders/[id]` first (no route swap yet) | none — additive |
| **P2** | Role inbox Home (dashboard rebuild) — cards + actions | low |
| **P3** | Forward pre-fills (sourcing/new, jobs/new, receiving params) + post-action redirects + stage-2 signature auto-prompt | low |
| **P4** | Route/label swap: requests→jobs move, orders→requests, redirects, nav regroup, i18n rename (en+ar), bottom nav | **highest UX risk — ship alone, verify, easy revert** |
| **P5** | Mobile audit + fixes + RTL (screenshots before/after) | medium, page-by-page |
| **P6** | Reminders: rental-expiry + stalled-request cards & notification events via existing outbox | low |
| **P7** | Full validation walkthrough (desktop + mobile, en + ar) → fix gaps → deploy → report | — |

Schema changes: **zero planned.** If a rule-table condition proves underivable during P1, the fallback is a derived-at-read computation, never a new column, unless impossible — flagged for approval first.

Testing: every pure domain addition (journey, next-action) gets unit tests; existing 211+ integration tests must stay green each phase; each phase deployed only after `npm run build` + full test suite + browser smoke.

### Validation walkthrough script (P7, no DB bypasses)
New customer → new Request (2 line items, qty 3+2) → Source items → RFQs to 2 suppliers → 2 quotations → award split across both → approval → hand off (2 cases) → ERP refs → 2 POs → receive partially → QC → receive rest → delivery job (pre-filled) → assign partner → magic link accept/start → on-site signature (receiver unauthorized → stage-2 prompt) → photos → sign-off → journey shows Active → simulate rental-expiry card → collection job → sign-off → devices back in stock → close request → generate batch → approve → paid. Every screen recorded; any step requiring memory/manual-search = product gap logged.

**Any missing UI flow found during the walkthrough is recorded as a product gap in the final report — not silently patched with scripts.**
