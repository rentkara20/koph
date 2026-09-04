# Signature Channels — design decision

**Date:** 2026-09-04 · **Verified against** `lib/db/schema.ts` (signature tables), `lib/actions/signatures.ts` (1,756 LOC) on `main` @ 733ea78
**Decision:** one `signature_request` with a `channel` dimension. MVP implements `agent_device` only.

---

## 1. The concept already exists — do not create a new table

`signature_request` is **already** the general "signing session" object, not an agent-device feature. Evidence from the live schema:

| Concept asked for | Already in the schema | Note |
|---|---|---|
General, standalone request | `signature_request.requestId` is **nullable** — "standalone use" is explicit in the schema comment | Not coupled to field work |
`status` | ✅ `draft · sent · opened · otp_verified · signed · rejected · expired · cancelled` | Covers every channel's lifecycle already |
`expiresAt` | ✅ + `expiryEnabled` + `reminderEnabled`/`reminderSentAt` | Reminder machinery exists but has no sender yet |
`ip` / `userAgent` | ✅ on both `signature_event` and `customer_signature` | |
`openedAt` | ⚠️ **not a column** — but `signature_event(eventType='opened')` records it with ip/user-agent, and `status='opened'` is set at open time | Derivable; add a denormalised column only for list-screen speed |
`documentSnapshot` | ✅ `customer_signature.snapshot` — immutable frozen JSON, rendered in preference to live tables | This is the strongest thing in the module |
Hash of what was signed | ✅ `customer_signature.auditDataHash` | Already there; the PDF is what's missing |
`signatureImage` | ✅ `signatureData` (base64) | |
`signedAt` | ✅ + `signedAtTz` (default `Asia/Riyadh`) | Timezone-correct already |
`authorizedSignerId` | ✅ `signatoryRole` (`receiver`/`authorized`) + `signatoryContactId` + `parentSignatureRequestId` chain | **Two-stage corporate signing is fully built** |
requested signer name/phone/email | ✅ normalised — `signatoryContactId` → `customer_contact` (name/phone/email) | Better than free-text columns. Actual signer identity is captured separately at signing (`customer_signature.fullName/mobile/nationalId`) — requested vs actual are already distinct |
Links to request / customer / task | ✅ `requestId`, `customerId`, `partnerTaskId` | Order and assets reachable via `request_item.orderUnitId` |
Verification identity | ✅ `verificationId` + public `/verify/[id]` page | |
Per-request policy | ✅ `requireNationalId`, `otpEnabled`, `otpHash/otpExpiresAt/otpAttempts/otpVerifiedAt`, `depositNote` | Already per-request, not global |

**Conclusion:** extend `signature_request`. Do **not** introduce a parallel `signing_session` — a second name for the same object would fork the one part of the system that is already correct, and every proof written since M1 lives in the existing table.

---

## 2. What is actually missing

1. **`channel` column does not exist.** Today the channel is *implicit in which function created the row*. This is the whole gap.
2. **There are two birth paths with divergent defaults** — `createSignatureRequest` (line 167) vs the on-site path (`signOnSiteByTaskToken`, line 936, and again at 1315) which forces `requireNationalId: true` and is born `status: "sent"` instead of `draft`. The Architecture Rescue doc flagged this in July; it is still open. **Adding `channel` before unifying these two paths guarantees the column is set inconsistently.** Order matters: unify first, then add the dimension.
3. **No `rejectionReason`.** `status='rejected'` and `signature_event(rejected)` exist; the *refusal-at-delivery* path is covered by `deliveryOutcome='refused'` + `remarks`. But a signer declining to sign at all (the common `email_link` case) has nowhere to say why.
4. **No agent attribution on the request.** `initiatedBy` is an enum (`admin|partner|system`) and `initiatorId` → `users.id`. A partner is **not** a user, so a partner-initiated request stores no identity of who initiated it. `createdByAgentId` is a real gap.
5. **No geolocation at the signing act.** IP and user-agent only. For `agent_device` — where the device is physically at the customer's site — lat/long is the cheapest, strongest evidence available, and it is the one channel where it is actually meaningful.
6. **No `sentAt`.** Fine while the only channel is agent_device; required the moment a link is dispatched (send → open latency is the core `email_link` metric).
7. **No PDF / document number / void-reissue.** Snapshot and hash exist; the artifact does not. Phase 1 of the roadmap.
8. **No per-channel policy.** The divergent defaults in point 2 are effectively a hardcoded channel policy. It should be data.

---

## 3. Two disagreements

### 3.1 `email_attachment` should not be a channel value
Two different things are being conflated:

- **Delivery channel** = how the *request* reached the signer (`agent_device`, `customer_link`, `email_link`).
- **Capture method** = how the *signature* came back — and this axis **already exists**: `customer_signature.signatureMethod` = `electronic | manual_upload`, complete with `uploadedFileUrl`, `uploadedBy`, `uploadedAt`, `approvedBy`, `approvedAt`, `reviewNotes`. The printed-signed-scanned-back flow is already modelled, reviewed and approved.

Putting `email_attachment` in the channel enum creates a signature request that can never reach `signed` through its own channel — a dead branch in the state machine. Model it instead as:

- *sending a document for review* → a `communication_log` row against the signature request. That table already exists for exactly this purpose (channels `whatsapp | email | outlook | mailto | copy`, status `prepared → manually_confirmed_sent`, with the explicit rule that opening a channel is not proof of send).
- *a paper signature coming back* → `channel='email_link'` (or whichever request it belongs to) with `signatureMethod='manual_upload'`.

So: **3 channel values, not 4.** The fourth need is met by two mechanisms that are already built.

### 3.2 The domain is a config task, not a design task
Correct that a strange hostname destroys trust — but no code changes with the domain. The token is hostname-independent; only the visible URL changes. Two notes:
- The signing link is already built from an env base URL (`NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`), so cutting over is DNS + env, not a refactor.
- The test run currently prints `WARN [Better Auth]: Base URL is not set` — the base URL is falling back to `http://localhost:3000` in that context. Set it explicitly before any customer-facing link ships, otherwise a generated link can carry the wrong origin.

---

## 4. The risk not mentioned: channels have different threat models

This is the real reason `channel` must drive **policy**, not just labelling.

| Channel | Who holds the device | Main risk | Verification that answers it |
|---|---|---|---|
`agent_device` | KARA's courier | The courier can watch, coach, or complete the form themselves. Identity of the signer is asserted by a KARA employee | OTP to the recipient's own phone + national ID + geo. **All three matter most here** — and OTP already exists for exactly this reason |
`customer_link` | The customer | The link travels over WhatsApp and is trivially forwardable; whoever opens it can sign | OTP bound to the contact's registered phone, short expiry, single-use token, and matching the signer against `signatoryContactId` |
`email_link` | An authorised corporate signatory | Shared mailboxes, delegation, out-of-office forwarding; and the highest-value signatures | Email + OTP to a *different* factor (phone), longer expiry with reminders, `signatoryRole='authorized'`, rejection with a reason |

Therefore: **per-channel policy defaults stored as data** (`app_setting`, keyed by channel: `otpRequired`, `nationalIdRequired`, `ttlHours`, `singleUse`, `remindAfterHours`), with the per-request booleans that already exist as the override. That converts today's hardcoded `requireNationalId: true` in the on-site path from an invisible behaviour into a configurable rule — and closes the two-birth-paths defect at the same time.

---

## 5. Concrete change set

**Step 1 — unify the birth paths (no schema change)**
One `createSignatureRequestCore(tx, { …, channel, policy })`. `signOnSiteByTaskToken` calls it with `channel='agent_device'` instead of hand-rolling an insert with different defaults. This is rescue-plan Wave 1 #4 and is a prerequisite for everything below.

**Step 2 — migration (additive, one migration)**
```
signature_request:
  channel        text not null default 'agent_device'   -- 'agent_device'|'customer_link'|'email_link'
  sent_at        integer
  opened_at      integer            -- denormalised from signature_event, for list screens
  created_by_agent_id text          -- partner_id when initiatedBy='partner'
  rejection_reason text
customer_signature:
  geo_latitude   real
  geo_longitude  real
  geo_accuracy   real
index signature_request(channel, status)
```
Backfill: every existing row is `agent_device` — which is true, and the default makes the backfill a no-op.

**Step 3 — capture geo in the existing on-site signing component** (`app/task/[token]/_components/on-site-signing.tsx`) via the browser geolocation API, best-effort, never blocking the signature.

**Step 4 — MVP stops here.** `customer_link` and `email_link` become: a new channel value, a policy row, and a dispatcher (WhatsApp API / Resend). Zero changes to the request, the snapshot, the signing page, the proof gate, `/verify/[id]`, or the document engine.

---

## 6. How this locks into the roadmap

- Phase 0 already contains the birth-path unification (D1's sibling defect). Step 1 lands there.
- **Phase 1 (Document Engine) is the real dependency for multi-channel.** A remote signer must see a fixed, numbered document — not a page that re-renders from live data. Do not ship `customer_link`/`email_link` before the immutable PDF exists, or a customer can sign one thing and receive another. This is the ordering constraint that matters most.
- Phase 2 gains a metric per channel: send → open → sign latency, and rejection rate by channel.
- Phase 4 pushes the signed PDF to Odoo identically regardless of channel — because the channel is a property of the request, not of the proof.

## 7. Rule to add to the constitution

15. **A channel is a delivery dimension, never a code path.** One signing core, one snapshot, one issuance. New channels add a value and a policy row — if a channel needs its own function, the abstraction is wrong.

---

## 8. Implementation status — 2026-09-04

Executed in the order the CTO set. Local only, uncommitted; `tsc` clean, `next build` succeeds, **795 tests pass in 108 files** (up from 767/106 — 28 new).

| Step | Status | Where |
|---|---|---|
1. Unify the birth paths, no schema change | ✅ | New `lib/actions/signature-request-core.ts`. All **four** insert sites now call `createSignatureRequestCore`: admin `createSignatureRequest`, `requestAuthorizedSignoff`, and both on-site auto-create blocks. `requireNationalId: true` is no longer hardcoded in the field paths — it is the `agent_device` policy. Side effect: stage 2 now always gets a `verificationId`, which it previously omitted (leaving `/verify/[id]` unreachable for those rows until a later read back-filled it) |
2. Migration | ✅ | `0047_conscious_iceman.sql` — purely additive `ALTER TABLE ... ADD`, no table rebuild (avoids the drizzle rebuild-SELECT trap). `channel` (default `agent_device`, so the backfill is a no-op and historically true), `sent_at`, `opened_at`, `created_by_agent_id` → `partner(id)`, `rejection_reason`, geo columns on `customer_signature`, index on `(channel, status)` |
3. Channel drives policy from `app_setting` | ✅ | `lib/domain/signature-channel.ts` (pure resolution) + `getSignatureChannelPolicies` / `updateSignatureChannelPolicy` in `settings.ts`, key `signatureChannelPolicies`. Precedence: system default ← stored setting ← per-request override, and `undefined` never overrides, so toggling one flag cannot reset the others. **No settings UI page yet** — the getters and the guarded action exist; the screen is a small follow-up |
4. Best-effort geo | ✅ | `lib/utils/signing-geo.ts` + wired into `on-site-signing.tsx` and `signature-form.tsx`. Never rejects, never throws, has its own watchdog for webviews that neither resolve nor error. When there are no coordinates the **reason is stored** (`denied` / `unavailable` / `timeout` / `unsupported` / `error`) — an omitted `geo` from an older client records `unsupported` rather than silence. Not captured on `manual_upload`, where the admin's browser location would be meaningless |
5. No remote channels before the PDF | ✅ by construction | `customer_link` and `email_link` exist as values and policies; nothing dispatches them. Enabling one is a dispatcher, not a rebuild |
6. BASE_URL | ⚠️ code hardened, **deployment still to verify** | `publicUrl` and the WhatsApp helpers now go through `requirePublicBaseUrl()`, which **throws in production** when `APP_BASE_URL`/`NEXT_PUBLIC_APP_URL` is unset, and falls back to localhost only outside production. No link is better than a wrong link. `.env.local` has `APP_BASE_URL`; the Vercel production env still needs confirming, along with `BETTER_AUTH_URL` (the test run's `Base URL is not set` warning) |

New tests: `lib/domain/signature-channel.test.ts` (17) and `lib/actions/signature-channel.integration.test.ts` (11) — the **first action-level suite for signature creation**, which is what D7 in the main review asked for. It pins: verification id always minted, channel policy applied, `agent_device` records no `sentAt`, stored policy honoured, agent recorded on partner-initiated requests, the admin flag beating the channel default, geo reason stored on refusal, coordinates stored on a fix, and stage-2 inheritance plus non-duplication.

### Two things left open
- **The local dev DB cannot take the migration — pre-existing drift, not this change.** `local.db` has 40 of 48 migrations in its ledger and fails at `0039_tired_exodus` with `duplicate column name: deposit_note`: the DDL was hand-applied locally without being recorded. The fresh-database chain `0000 → 0047` is proven clean by the test suite, which migrates from scratch on every run. Reconciling that dev DB (record the already-applied rows, or rebuild it) is a separate task and must not be pointed at production.
- **No browser verification of the geo prompt yet**, because the dev DB above will not migrate. The capture path is unit-tested at both ends (browser-mapping helper and stored columns); the visual confirmation on a real phone is still owed.
