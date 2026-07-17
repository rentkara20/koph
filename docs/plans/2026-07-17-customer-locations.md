# Customer Locations Implementation Plan

> **For Codex:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Add reusable customer sites, allow each contact to belong to multiple sites, and let each request select an exact site before selecting its receiver.

**Architecture:** Store customer sites separately from people, connect them through a many-to-many join table, and keep a nullable selected site on each request. Existing customer/contact address fields remain readable for backward compatibility; new request routing prefers the selected customer site. Google place selection is progressively enhanced when an API key is configured, while manual address and link entry always remain available.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM with SQLite/libSQL, Vitest, next-intl, Google Maps JavaScript Places API.

---

### Task 1: Customer site domain and schema

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/domain/customer-location.ts`
- Test: `lib/domain/customer-location.test.ts`
- Create: generated Drizzle migration under `lib/db/migrations/`

**Steps:**
1. Write failing domain tests for default-site choice, contact/site matching, and map-link generation.
2. Run the test and confirm it fails because the domain module is missing.
3. Add the domain helpers and rerun until green.
4. Add `customer_location`, `customer_contact_location`, and nullable request location/snapshot fields.
5. Generate the migration; keep schema and data migration separate.

### Task 2: Transactional customer-site actions

**Files:**
- Create: `lib/actions/customer-locations.ts`
- Test: `lib/actions/customer-locations.integration.test.ts`
- Modify: `lib/actions/customer-contacts.ts`

**Steps:**
1. Write failing integration tests proving the first site becomes default, only one default exists, and one contact can be linked to several sites.
2. Run the focused integration test and confirm the expected failure.
3. Implement authenticated CRUD and transactional default switching.
4. Extend contact create/update to replace site links atomically.
5. Rerun focused tests until green.

### Task 3: Customer page experience

**Files:**
- Modify: `app/admin/customers/[id]/page.tsx`
- Create: `app/admin/customers/[id]/_components/customer-locations-section.tsx`
- Modify: `app/admin/customers/[id]/_components/contacts-section.tsx`
- Create: `components/google-place-picker.tsx`
- Modify: `lib/i18n/messages/en.json`
- Modify: `lib/i18n/messages/ar.json`

**Steps:**
1. Add a dedicated Locations card above Contacts.
2. Build an add/edit sheet with search, map preview when configured, draggable/selected coordinates, and manual fallback fields.
3. Let each contact select multiple customer sites and one preferred site.
4. Ensure controls have mobile-sized hit areas, loading states, empty states, and concise Arabic/English labels.
5. Run TypeScript and targeted lint checks.

### Task 4: Guided request location then receiver

**Files:**
- Modify: `lib/actions/requests.ts`
- Modify: `lib/validation/schemas.ts`
- Modify: `app/admin/requests/new/_components/request-form.tsx`
- Modify: `app/admin/requests/[id]/page.tsx`
- Modify: `app/admin/requests/[id]/_components/receiver-section.tsx`
- Modify: `app/admin/requests/[id]/_components/logistics-section.tsx`
- Modify: `app/task/[token]/page.tsx`

**Steps:**
1. Add request-location selection and validation that the site belongs to the request customer.
2. Save a location snapshot when creating or changing the request site.
3. Filter/sort receiver choices by the selected site while allowing any customer contact as an exception.
4. Make admin and courier route cards prefer the selected site snapshot over legacy contact/customer addresses.
5. Add regression tests for cross-customer site rejection and snapshot stability.

### Task 5: Migration and verification

**Files:**
- Modify only generated migration metadata as produced by Drizzle.

**Steps:**
1. Inspect the generated SQL and confirm it contains additive nullable fields/tables only.
2. Apply the migration to the local database without inserting fake customer sites.
3. Run focused tests, the complete test suite, TypeScript, and targeted ESLint.
4. Exercise customer site creation and request selection in the browser without saving fabricated production data.

### Task 6: Unified customer locations and people workspace

**Files:**
- Modify: `lib/domain/customer-location.ts`
- Test: `lib/domain/customer-location.test.ts`
- Modify: `app/admin/customers/[id]/page.tsx`
- Modify: `app/admin/customers/[id]/_components/customer-locations-section.tsx`
- Modify: `app/admin/customers/[id]/_components/contacts-section.tsx`
- Create: `app/admin/customers/[id]/_components/customer-locations-people-section.tsx`

**Steps:**
1. Write a failing test that groups one contact under every linked location and keeps unlinked contacts separate.
2. Implement the grouping helper and make the focused test pass.
3. Replace the duplicate Locations and Contacts cards with one “Customer locations & people” card.
4. Show contacts inside each location card, plus an unassigned-contacts group.
5. Keep two clear actions, “Add location” and “Add person”, and remove duplicate address/map controls from the visible contact form while preserving legacy fields in storage.
6. Run focused tests, the full suite, TypeScript, ESLint, and a read-only browser inspection.
