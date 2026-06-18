# KOPH — Session Brief
> Paste this file into a new Claude Code session to resume work without re-explaining history.

---

## What is KOPH?
**Kara Operations & Partner Hub** — internal web app for Rent Kara's operations team.
Bilingual (Arabic / English). Two main audiences:
- **Admin / Ops** — `https://koph.vercel.app/admin/…` (login required)
- **Partners (field workers)** — `https://koph.vercel.app/task/[token]` (magic link, no login)

**Live URL:** https://koph.vercel.app  
**GitHub:** https://github.com/rentkara20/koph (push to `main` → auto-deploys to Vercel)  
**Admin login:** abdelrahman.ali@rentkara.com

---

## Tech Stack
| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 15 App Router | Server components + server actions throughout |
| Language | TypeScript strict | No `any` — ESLint will fail the build |
| Styling | Tailwind CSS v4 + shadcn/ui | Primitives via `@base-ui/react` (NOT Radix) |
| ORM | Drizzle ORM | `drizzle-orm/libsql` dialect |
| DB | Turso (libSQL / edge SQLite) | dev = `koph-dev-rentkara`, prod = `koph-prod-rentkara` |
| Auth | Better Auth | Drizzle adapter; email+password only |
| i18n | next-intl | Static JSON imports only — no dynamic/computed imports |
| IDs | `@paralleldrive/cuid2` | `createId()` from `lib/utils/ids.ts` |
| File storage | Vercel Blob | Store `koph-photos` (store_Ab9wKtYvRVDUpjOc), public access |
| Deployment | Vercel | `vercel.json` with `"framework":"nextjs"` — **DO NOT REMOVE** |

---

## Critical Gotchas (hard-won)
1. **`vercel.json` with `{"framework":"nextjs"}` is REQUIRED** — removing it breaks all routes (build output API generates only a 404 catch-all).
2. **No `middleware.ts`** — auth gating is done in server-component layouts (`app/admin/layout.tsx`, `app/partner/layout.tsx`). A middleware crashed on Vercel with `__dirname is not defined` due to next-intl plugin injecting Edge-incompatible code.
3. **Never `--prebuilt` from Mac** — bundles macOS libsql native binary; prod crashes with `Cannot find module '@libsql/linux-arm64-gnu'`. Always push to git and let Vercel build.
4. **Better Auth schema keys must be model names** — `user`, `session`, `account`, `verification` (not plural table vars).
5. **`@base-ui/react` has no `asChild`** — use `buttonVariants()` on `<Link>` instead of `<Button asChild>`.
6. **`NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL`** must be `https://koph.vercel.app` in prod (not localhost).
7. **Drizzle `eq()` type inference** — when filtering by a string-enum column, cast explicitly: `eq(requests.status, status as "draft" | "assigned" | ...)`.
8. **`next-intl` messages** — static imports in `lib/i18n/config.ts`; adding new keys requires updating both `en.json` and `ar.json`.
9. **`@vercel/blob` v2.4.0** — `handleUpload` is exported from `@vercel/blob/client` (not `/server`). `onBeforeGenerateToken` takes 3 params: `(pathname, clientPayload, multipart)`.

---

## Environment Variables (Vercel)
| Var | Scope | Value |
|-----|-------|-------|
| `TURSO_DATABASE_URL` | Production | prod Turso URL |
| `TURSO_AUTH_TOKEN` | Production | prod Turso token |
| `BETTER_AUTH_SECRET` | Production | long random string |
| `BETTER_AUTH_URL` | Production | `https://koph.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | Production | `https://koph.vercel.app` |
| `BLOB_READ_WRITE_TOKEN` | Prod+Preview+Dev | Vercel Blob token |

Local `.env.local` currently only has `BLOB_READ_WRITE_TOKEN`. Add the Turso + Auth vars manually for local dev (DB falls back to `file:local.db` when `TURSO_DATABASE_URL` is unset — build-safe but no real data).

---

## Key File Paths
```
lib/db/schema.ts          — full Drizzle schema (all tables)
lib/db/index.ts           — db client (falls back to file:local.db)
lib/auth/config.ts        — Better Auth config
lib/auth/session.ts       — getSession() helper
lib/i18n/config.ts        — next-intl static import setup
lib/i18n/messages/en.json — English strings
lib/i18n/messages/ar.json — Arabic strings
lib/utils/ids.ts          — createId(), generateToken()
lib/utils/request-number.ts — generateRequestNumber() → KR-YYYY-NNNNN
lib/utils/activity.ts     — logActivity() helper
lib/utils/format.ts       — formatDate(), formatDateTime()
lib/actions/customers.ts  — CRUD server actions
lib/actions/requests.ts   — CRUD + status server actions
lib/actions/partners.ts   — CRUD + contract server actions
lib/actions/tasks.ts      — task lifecycle + magic link + photo queries
app/api/upload/route.ts   — Vercel Blob upload handler (POST)
vercel.json               — {"framework":"nextjs"} — CRITICAL
next.config.ts            — next-intl plugin + Blob image domain
```

---

## Database Schema (all tables)

| Table | Purpose |
|-------|---------|
| `user` | Admin users + partner portal users (role: admin/finance/viewer/partner) |
| `session` / `account` / `verification` | Better Auth internal tables |
| `request_type` | Config-driven service types (bilingual nameEn/nameAr) |
| `customer` | Customer records with address, mobile, maps link |
| `request` | Service requests — has requestNumber (KR-YYYY-NNNNN) + trackingCode (6-char) |
| `request_item` | Line items on a request (description, brand, model, serial, qty) |
| `partner` | Field partner companies/individuals |
| `partner_contract` | Contracts per partner: pricingModel (per_order/per_item/per_day/per_hour/fixed) + unitPrice |
| `partner_task` | Task assigned to partner for a request; has magic-link token (48-char, 7-day TTL) |
| `services_catalog` | Checklist services (bilingual) |
| `task_service` | Many-to-many: which services are checked off on a task |
| `signature_request` | e-signature requests sent to customers (secure token, OTP optional) |
| `signature_event` | Open/view/sign event log |
| `customer_signature` | Captured signature data (base64 SVG) + full name + national ID |
| `consent_version` | PDPL consent text versions |
| `attachment` | Vercel Blob file records (entityType: request/partner_task/signature_request) |
| `activity_log` | Append-only audit trail with i18n keys |
| `payment_batch` | Monthly payment batch per partner (draft→approved→sent_to_finance→paid) |
| `partner_payment` | One row per closed task; linked to batch when batched |

All timestamps are **Unix milliseconds integers** (not Date objects). `createdAt` uses `$defaultFn(() => Date.now())`.

---

## Status Machines

### Request status (8 states)
```
draft
  → assigned     AUTO: when first task is created
  → in_progress  AUTO: when any task enters in_progress or pending_signoff
  → completed    AUTO: 0 active tasks + ≥1 closed task

Manual overrides (Ops only — never auto-set):
  → failed | on_hold | cancelled | rescheduled
```
`syncRequestStatus(requestId)` in `lib/actions/tasks.ts` handles auto logic. It NEVER overrides a manual status.

### Partner task status (8 states)
```
pending   → accepted | rejected | cancelled(ops)
accepted  → in_progress | cancelled(ops)
in_progress → pending_signoff("mark as done") | failed(partner) | cancelled(ops)
pending_signoff → closed  ← ADMIN SIGN-OFF ONLY (via tasks-section.tsx SignOffButton)
```
`failed` requires a `failureReason` enum: customer_unavailable | wrong_address | item_damaged | access_denied | customer_rescheduled | other

---

## Magic Link (Partner Task)
- Token: 48-char random hex (`generateToken(48)` from `lib/utils/ids.ts`)
- TTL: 7 days from creation
- URL: `https://koph.vercel.app/task/[token]`
- No auth required — token IS the auth
- Actions available per status: pending→accept/reject, accepted→start, in_progress→mark_done/mark_failed
- Expired + active task → Ops can regenerate link (new token + 7-day TTL)
- Photos can be uploaded while status is `in_progress` (max 10 per task, 15MB each, JPEG/PNG/WebP/HEIC)

---

## Phases Completed ✅

### Phase 1 — Foundation
Auth (login/logout), admin layout + nav, dashboard stub, root redirect.

### Phase 2 — Customers + Requests
- `/admin/customers` — list (search by name/mobile/city), create, edit
- `/admin/requests` — list (filter by status), create (with dynamic items), detail page
- Detail page: info card, items table, activity log, tracking code copy, manual status dropdown
- Request number: `KR-YYYY-NNNNN` (sequential per year); tracking code: 6-char alphanumeric

### Phase 3 — Partners + Contracts
- `/admin/partners` — list (active/inactive badge), create, detail/edit
- Contracts managed inline on partner detail (add form, status toggle)
- Contract pricing models: per_order / per_item / per_day / per_hour / fixed

### Phase 4 — Partner Tasks + Magic Link
- Tasks section embedded on request detail page
- Assign task to partner (select partner → filtered contract list → notes)
- Copy magic link, regenerate expired link, cancel task, sign-off (with quantity for time/unit-based contracts)
- Public `/task/[token]` page — mobile-first, no login, full task lifecycle UI
- Partner actions: accept/reject/start/mark_done/mark_failed (with failure reason form)

### Phase 5 — Photo Uploads (Vercel Blob) ← JUST COMPLETED
- `POST /api/upload` — validates task token, enforces 10-photo cap, saves attachment to DB
- `PhotoUpload` component — camera capture (`capture="environment"`), 3-col grid, progress state
- Task page shows photo grid (read-only) for non-in_progress states; upload UI only when in_progress
- `getTaskPhotos(taskId)` added to `lib/actions/tasks.ts`

---

## Phases Remaining 🔜

### Phase 6 — Signatures (e-signature via magic link)
Build around `signature_request` + `signature_event` + `customer_signature` tables.
- Admin creates signature request linked to a request (or standalone)
- Sends secure link (`/sign/[token]`) to customer (SMS/WhatsApp — manual copy for now)
- Customer opens link: see document preview, optionally OTP verify via mobile, draw/type signature, accept PDPL consent
- Events logged: opened, otp_sent, otp_verified, signed/rejected
- Admin sees status on request detail
- `requireNationalId` flag → prompt for national ID before signing (stored in `customer_signature.nationalId`)
- Status machine: draft→sent→opened→[otp_verified]→signed | rejected | expired | cancelled

### Phase 7 — Ops Sign-off Enhancement
- When Ops signs off a task (`pending_signoff → closed`), auto-create a `partner_payment` row
- Calculate `totalAmount = quantity × unitPrice` based on the contract's pricingModel
- If pricingModel is `per_order` or `fixed`, quantity = 1

### Phase 8 — Payment Batches
- `/admin/payments` — list batches per partner per month
- "Generate batch" — groups all `pending` partner_payments for a partner+month into a `payment_batch`
- Batch status: draft → approved (admin) → sent_to_finance → paid
- Export batch as CSV / PDF

### Phase 9 — Services Catalog + Task Checklist
- `/admin/settings/services` — manage `services_catalog` (create/edit/reorder/toggle)
- On task detail page (admin): assign services checklist to a task (`task_service` rows)
- On `/task/[token]`: show checklist, partner ticks items off

### Phase 10 — Reports + Search
- Global search across customers / requests / partners
- Reports: requests by status/period, partner performance, payment summary
- Export to CSV

---

## UI Component Library
All in `components/ui/`:
- `button.tsx` — Button + `buttonVariants()` (use on `<Link>` instead of `asChild`)
- `badge.tsx` — Badge + `requestStatusVariant` map
- `card.tsx` — Card/CardHeader/CardContent/CardTitle
- `input.tsx`, `label.tsx`, `textarea.tsx` — form fields
- `select.tsx` — native `<select>` with ChevronDown overlay
- `separator.tsx` — horizontal/vertical divider
- `dropdown-menu.tsx` — for status action menus

---

## Billing / Pricing Model Reference
```
per_order  — flat fee per task (quantity always 1)
per_item   — unit price × signoffQuantity (items handled)
per_day    — unit price × signoffQuantity (days worked)
per_hour   — unit price × signoffQuantity (hours worked)
fixed      — flat contract price (quantity always 1)
```
`signoffQuantity` is set by Ops during sign-off when the model requires it.
