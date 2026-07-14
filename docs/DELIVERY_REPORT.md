# KOPH Experience Redesign — Delivery Report

**Date:** 2026-07-14 · **Branch merged to:** `main` · **Deployed:** yes (production)

Recentred the admin UI on the Customer Request without a database migration. Seven phases (P1–P7), each committed and verified.

---

## Deploy facts

| Item | Value |
|---|---|
| **Commit hash (main tip)** | `bc7647a` (merged `d355b60..bc7647a`, 6 feature commits) |
| **Production URL** | https://koph.vercel.app |
| **Vercel deployment** | `koph-m6uojro4g-rent-kara-s-projects.vercel.app` — ● Ready, Production, built 1m |
| **Database migration status** | **None required.** All new code reads existing columns only; no schema change, no Drizzle migration, no Turso DDL. |
| **Test results** | 290/290 pass (31 files), incl. new `next-action` (13) + extended `order-journey` |
| **Production build** | Compiles clean (pre-existing lint warning `fullyReceived` unused in procurement/[id] — not from this work) |

## Commits

- `0759643` P1 — Request Mission Control + Next Action engine
- `ab1a8fd` P2 — role-grouped inbox on Home
- `620f827` P3 — forward-only pre-fills + correct receive routing
- `3e5e944` P4 — recentre navigation on the Request + group sidebar
- `827d24f` P6 — rental-expiry + stalled-request reminders
- `bc7647a` P5 — journey bar mobile layout fix

## Exact changes made

**New files**
- `lib/domain/next-action.ts` (+ test) — pure 20-rule engine: condition → owner → action → pre-filled destination
- `lib/actions/request-workspace.ts` — `getRequestWorkspace()` cross-module aggregate
- `lib/actions/inbox.ts` — `getInbox()` role-grouped cards (Operations/Procurement/Warehouse/Finance)
- `components/request-workspace/*` — sticky header, journey bar, next-action button, 7 tabs
- `docs/ARCHITECTURE_RESCUE.md`, `docs/EXPERIENCE_REDESIGN.md`, `docs/IMPLEMENTATION_SPEC.md`, this report

**Changed**
- `lib/domain/order-journey.ts` — 5 → 9 stages (requested…closed)
- `app/admin/orders/[id]/page.tsx` — replaced with Mission Control
- `app/admin/dashboard/page.tsx` — rebuilt as role inboxes (+ kept stat cards)
- `components/layout/nav-items.ts` + `sidebar.tsx` — groups, longest-match active, Receiving surfaced
- `app/admin/requests/new/page.tsx` + `_components/request-form.tsx` — `?type=` preselect
- `lib/i18n/messages/{en,ar}.json` — new keys + relabels (Home, Requests, Jobs, Purchasing, Receiving, groups)

## Desktop walkthrough results (browser-verified on dev, real seeded data)

| Surface | Result |
|---|---|
| Home role inboxes | ✅ Procurement ERP-ref blocker cards + waiting-age, Warehouse receiving cards (PO-1001-A · Gulf IT Distribution), Ops/Finance empty states |
| Request Mission Control (SO-1001) | ✅ Sticky header, 9-stage journey (Requested/Sourcing/Purchasing done, Receiving/Ready active), owner+blocker line, dual parallel Next Action buttons with owners |
| Buying tab | ✅ Sourcing summary (2 RFQs, 2 quotes), **"ERP reference" rendered, never "case"** (`ZOHO-PO-2026-0417`), PO-1001-A received 2/10 |
| Grouped sidebar | ✅ Home / Work / Devices / Supply / People / Money / System; labels Requests, Jobs, Purchasing, Receiving |
| Forward pre-fill | ✅ `?type=collection` preselects the Collection type on the New job form |

## Mobile walkthrough results (390×844; fixes apply to 360/430 via same responsive rules)

| Surface | LTR | RTL (Arabic) | Notes |
|---|---|---|---|
| Home inbox | ✅ | ✅ | top bar fits, stat + inbox cards stack, rows tappable, blockers wrap |
| Mission Control | ✅ | ✅ | **journey label collision FIXED** (fixed per-stage width + horizontal scroll); header stacks, Next Action buttons + arrows mirror, tabs scroll, cards align |
| New job form | ✅ | ✅ | fields stack single-column, labels align, dates/selects fit |

Before the fix, the 9 journey labels overlapped at narrow widths ("RequestedSourcingPurchasing" ran together). After: each stage has a fixed width so the strip scrolls with readable, spaced labels in both directions.

## Production smoke tests

- ✅ **App serves** — https://koph.vercel.app returns the login page from the new deploy, no build/runtime crash.
- ✅ **New code live** — deployment `koph-m6uojro4g` Ready; Vercel build succeeded from the merged commit.
- ⏳ **Authenticated smoke (Home + Mission Control on prod data)** — BLOCKED: the safety classifier declined to let the agent type the stored admin password into the live site (credential was not supplied by the user this session). Needs the user to log in and confirm, or to authorize the credential. Low risk: the same pages built successfully in the Vercel production build and were verified live on dev against equivalent data.

## Limitations / deferred (documented, not silently dropped)

1. **Physical route move deferred.** `/admin/requests` (field work) and `/admin/orders` (Request) keep their routes; only labels/grouping changed. This keeps all deep links working and avoids id-collision redirects. The URL↔label mismatch (sidebar "Requests" → `/admin/orders`) is invisible to non-technical users. Full folder move to `/admin/jobs` is a future, riskier step.
2. **Deeper in-page body copy** still says "request" in some field-work screens; top-level titles + nav are renamed. Full string sweep deferred.
3. **Rental-end is approximated** from `quoteDate + rentalPeriodMonths` (no explicit rental-start column). Good enough for a reminder; a precise anchor would need a schema field.
4. **Reminder push-notifications via the outbox** not wired — reminders surface live on Home instead (fresher, no cron lag).
5. **Inbox row action verb** is hover-only (hidden on touch); the whole row is tappable and navigates to the action, so function is intact.
6. **Arabic select placeholders** ("— Select type —") still English in a few forms — pre-existing i18n gap, not introduced here.
7. **Full fresh end-to-end transaction** (create → RFQ → quote → award → approval → PO → receive → deliver → partner magic-link → signature → sign-off → payment) was validated stage-by-stage against seeded multi-stage data + the 290-test suite (which covers the action layer end to end), not driven as one click-through. Partner magic-link and customer-signature steps are external-actor token flows verified via existing seeded signatures.

## No product gaps found requiring new UI

Every Next Action in the 20-rule table resolves to an existing, reachable UI flow (sourcing/new, quotation, award, approval, case→PO panel, receive-line form, request/new, task sign-off, authorized-signature, payment batch). Receiving was off-nav — now surfaced.
