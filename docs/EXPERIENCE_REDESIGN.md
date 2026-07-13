# KOPH Experience Redesign — Optimizing for Human Understanding

**Date:** 2026-07-13 · Companion to ARCHITECTURE_RESCUE.md. That doc fixed the code's mental model; this one fixes the **human's**.

**Success metric:** a new operations employee completes an entire request end-to-end after one hour of training.

---

## 1. The simplest possible mental model of this business

> **Devices live in three places: at the supplier, in our warehouse, at the customer.
> KOPH's entire job is to move devices between those three places — and prove it.**

```
   SUPPLIER  ──(buy + receive)──▶  WAREHOUSE  ──(deliver)──▶  CUSTOMER
                                       ▲──────(collect/swap)──────┘
```

Three places. Two directions. Proof at every hop (signature or photo). Money follows the moves: we pay suppliers for hop 1, customers pay us for hop 2, we pay partners for driving every hop.

That's it. A COO can run the company on this diagram. Everything in KOPH that cannot be located on this diagram is overhead.

## 2. If KOPH had only five concepts

| Concept | Plain meaning | Today's fragments it absorbs |
|---|---|---|
| **Order** | What a customer bought from us. The story/file folder. | order, order_line |
| **Device** | A physical thing we own, in one of the three places. | order_unit, accessories, warranty, maintenance |
| **Job** | A movement of devices that a human executes, with proof. | request + partner_task + signature + delivery note + pickup task |
| **Buying** | Getting devices from suppliers. | sourcing + RFQ + quotes + evaluation + approval + case + PO + receiving |
| **Money** | What we owe partners (and track about buying). | partner_payment, payment_batch, statements |

People (customers, suppliers, partners) are the address book — supporting cast, not concepts.

## 3. The one object everything revolves around

For the **database**, it's the Device (established in ARCHITECTURE_RESCUE.md).
For the **human**, it's the **Order**.

A human thinks in stories: *"Al-Rajhi ordered 50 laptops"* — and sourcing, purchasing, receiving, delivery, the rental period, collection, and closure are **chapters of that one story**. Today those chapters are scattered across 6 menu items and the user is the only thread connecting them. The user IS the integration layer. That's why you feel lost: you're doing the joins in your head.

`lib/domain/order-journey.ts` already derives the Order→Sourcing→Procurement→Assets→Delivery stages. The data model already knows the story. The UI just never tells it.

## 4. Where every operation begins and ends

- **Begins:** the **Home inbox** ("what needs me right now") or the **Order page** ("start a new chapter of this story").
- **Ends:** back on the **Order page**, with its journey bar advanced one stage.

Nothing should begin from a bare entity list. Lists are for looking things up, not for working.

## 5. If a user remembers only one page

**The Order detail page** — rebuilt as mission control:

```
Order #10669 — Al-Rajhi — 50× Latitude 5440 — 12 months
[✓ Sourced] [✓ Purchased] [✓ Received 50/50] [● Delivering 30/50] [ Active ] [ Collect ] [ Closed ]
                                               ▶ NEXT ACTION: Assign delivery of 20 remaining units
Chapters: Buying (3 POs) · Devices (50) · Jobs (2 deliveries, 0 collections) · Documents (2 signed notes)
Rental ends: 2027-07-01 (needs collection job by then — system will remind)
```

One page = the whole story + exactly one suggested next action per open stage.

## 6. If we deleted half the menus — survivors

**Home (inbox) · Orders · Devices · Jobs · People · Money.** Six.

Everything else becomes a tab or a step *inside* those:
- Sourcing, Procurement, Receiving → chapters inside **Buying**, reached from the Order (or from Devices → "Restock" for non-order buying).
- Signatures → a step inside a Job. Never a destination. (Keep a small archive list under Documents/Reports.)
- Warranty, Maintenance, Accessories → tabs on the **Device** page.
- Requests → renamed **Jobs** (a "request" requests nothing; it's work to execute).
- Reports, Users, Settings → gear icon.
- Search → the top bar, not a page.

## 7. Pages that exist only because implementation evolved that way

| Page | Why it exists historically | Business need? |
|---|---|---|
| `/admin/sourcing` + `/admin/procurement` as **two peer menus** | Built in two milestones (M-orders 07-07, Sourcing V2 07-11) | One activity: Buying. The seam between them (case → PO) is a migration artifact users must navigate. |
| Procurement **case** screens | Sourcing V2 needed an ERP-link anchor | Users should never see a "case." It's a join row. |
| `/admin/signatures` top-level | Signature module built standalone (M1) before tasks matured | A signature is proof of a job step. Standalone list = archive at most. |
| `/admin/accessories` top-level | Separate mini-inventory built 07-08 | It's device stock. Tab under Devices. |
| `/admin/warranty`, `/admin/maintenance` top-level | Built as separate modules 07-07 | Attributes/events of a Device. Tabs. |
| `/admin/search` | Added before lists had good filters | Top-bar feature. |
| `/admin/procurement/receiving` hidden off-nav | Late addition (pickup flow 07-13) | Warehouse's whole job — deserves to be THE warehouse inbox, not hidden. |
| Requests → new asks for customer again, items re-typed | request_item predates order_unit linkage | A delivery job born from an order should inherit everything. |

## 8. Walkthrough: one complete customer order, today's UI

**Scenario:** new ops employee. Customer signed quote #10669 — 20 laptops, 12 months. Walk every step; stop at every "would they naturally know what to do next?" = **NO**.

1. **Create customer** → Customers → New. Fine. ✅
2. **Create order** → Orders → New, enter lines. Fine. ✅
   → Order sits at `confirmed`. Page shows lines. **STOP ❌ Context loss #1 — the cliff.** Nothing says *"you have 0 of 20 devices; source them."* Next step lives in a different menu (Sourcing) and nothing points there. Employee must be *told* the pipeline exists. The Order knows its own gap; it stays silent.
3. **Sourcing** → Sourcing → New → re-describe items (customer vs supplier description), link order. **❌ #2:** starting from the order, why am I re-entering what the order already says? Duplicated data entry, drift risk, and the mental link order↔sourcing is maintained by the employee's memory.
4. **RFQ → quotes → award → approval.** Four sub-steps with 9 statuses. Award requires knowing "evaluation supersede" semantics. **❌ #3:** statuses like `handed_off` vs `under_evaluation` are implementation vocabulary. Employee question at every screen: *"what do I click now?"* — no screen answers it.
5. **Handoff** creates a *procurement case* per supplier. Now the employee must (a) go to the ERP, make the real PO, (b) come back, find the case, link the ERP ref, (c) then "Create PO from case." **❌ #4 — the worst seam.** Three manual hops across two systems and two menus, with a bridging object ("case") that means nothing in business terms. Forget step (b) and the flow silently stalls — nothing chases you.
6. **Receiving** → `/admin/procurement/receiving` — not in the nav. **❌ #5:** the warehouse's primary screen is unreachable by navigation. Employee must know the URL or drill through PO detail.
7. Devices land in stock (maybe QC). Employee must now *remember* order #10669 is waiting. **❌ #6:** stock arriving for an order does not notify anyone or advance anything visible on the order.
8. **Create delivery** → Requests → New → select customer *again* → import items by typing the order number. **❌ #7:** the order page has no "Deliver" button; the link is re-established by memory + manual number entry, in reverse.
9. **Assign partner** → inside request, choose partner, contract, contact. OK-ish ✅ (form guides).
10. **Partner executes via magic link.** ✅ Genuinely good. Partner needs zero training. *This is the UX bar the admin side should meet.*
11. **Two-stage signature.** Receiver signs; if not an authorized signatory, admin must *know* to click "request authorized sign-off." **❌ #8:** the system already stores `isAuthorizedSignatory=false`; it should prompt, not wait for the employee to recall a legal rule.
12. **Sign-off** → find task in `pending_signoff`, verify photos/signature, close. Findable only if you know to check Requests. **❌ #9:** no unified "awaiting my sign-off" inbox on Home.
13. **Rental runs 12 months.** `rentalPeriodMonths` is stored. Nothing ever fires. **❌ #10 — a business-critical memory leak:** no screen, job, or notification for "rental ending, schedule collection." Revenue-relevant deadlines live in employees' heads.
14. **Collection** → repeat #8's manual dance in reverse. ❌ same loss.
15. **Payment** → Payments → pick partner → generate batch (must understand business-month offset) → approve → sent → paid. Mostly fine ✅, but nothing tells finance *"3 partners have unbatched payments this month"* unprompted. ⚠️

**Score: 10 hard context losses.** Every one has the same shape: **the system knows the next step and doesn't say it.** The data is there each time — order gap, case awaiting ERP ref, stock arrived, signatory flag, rental end date. KOPH is a database with excellent integrity that refuses to speak.

## 9. The redesign — make the business feel obvious

### Design law #1: The system asks; the human answers.
Every state that needs a human = a card in an inbox with one button. If an employee ever has to *remember* to do something, that's a bug with the same severity as data loss.

### Design law #2: Work flows forward from where you are.
Every page's primary button is the *next chapter*, pre-filled. Order → [Source these] → [Awaiting ERP PO — paste ref] → [Receive] → [Deliver] → [Schedule collection]. Never re-enter what the previous chapter knew. Menus are for looking up; buttons are for working.

### Design law #3: One person, one inbox.
- **Ops Home:** jobs awaiting assignment · tasks awaiting sign-off · failed tasks · rentals ending ≤30d
- **Procurement Home:** sourcing awaiting quotes · awards awaiting approval · cases awaiting ERP ref
- **Warehouse Home:** expected receipts · QC queue · returns to check in
- **Finance Home:** approvals · unbatched payments per partner · batches in flight
Role determines which cards you see. The inbox IS the training: do the top card, repeat.

### Navigation (final)

```
🏠 Home        your inbox — start and end of every day
📦 Orders      the stories (mission-control page from §5)
💻 Devices     inventory: 3-place view (supplier/warehouse/customer) + tabs: maintenance, warranty, accessories
🚚 Jobs        deliveries, collections, swaps, pickups — with partner/task/proof inside
🧑 People      customers · suppliers · partners
💰 Money       partner payments & batches
⚙️            reports · users · settings
```

### The new-employee hour
- 0–10 min: the three-places diagram + "Order = story, chapters advance left to right."
- 10–30 min: shadow one order on the mission-control page; click each Next Action.
- 30–55 min: work their real inbox — cards tell them everything.
- 55–60 min: "if stuck, the page's blue button is always the right answer."
Passes the metric **because there is nothing else to teach**: no menu tour, no vocabulary list, no pipeline map to memorize — the pipeline is drawn on every order.

### What this costs (deliberately little — this is UI, not schema)
1. **Order mission-control page** — `order-journey.ts` already computes the stages. Highest single win.
2. **Role inboxes on Home** — every card is an existing status query; the outbox already emits the events.
3. **Forward buttons** — "Source these" pre-fills sourcing from order lines; "Deliver" pre-fills a job from received units; "Request authorized sign-off" auto-prompts off the signatory flag.
4. **Rental-expiry cards** — one cron query over `rentalPeriodMonths`. Closes the worst business hole.
5. **Nav regroup + renames** (Requests→Jobs; hide case vocabulary; receiving into Warehouse inbox).
None of this waits for the Wave-3 schema work; it can ship on today's database.

### The test to run before shipping anything new (permanent)
For any new screen or feature: *"Which inbox card creates it, which button completes it, and which journey stage does it advance?"* If there's no answer, the feature has no home in the mental model — redesign it before building it.
