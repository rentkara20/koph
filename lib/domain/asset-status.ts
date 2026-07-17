// Pure asset lifecycle state machine. Server actions call canAssetTransition
// before any write; the UI uses assetActionsFor to render valid buttons only.

export type AssetStatus =
  | "receiving_qc"
  | "in_stock"
  | "reserved"
  | "assigned"
  | "delivered"
  | "returned"
  | "maintenance"
  | "damaged"
  | "supplier_return_pending"
  | "supplier_returned"
  | "retired"
  | "sold"
  | "lost"

export type AssetAction =
  | "qc_pass"
  | "qc_fail"
  | "reserve"
  | "unreserve"
  | "assign"
  | "unassign"
  | "deliver"
  | "return"
  | "restock"
  | "send_maintenance"
  | "repair_done"
  | "mark_damaged"
  | "retire"
  | "sell"
  | "mark_lost"
  | "found"
  | "start_supplier_return"
  | "confirm_supplier_return"

// action -> [fromStatuses, toStatus]
const TRANSITIONS: Record<AssetAction, { from: AssetStatus[]; to: AssetStatus }> = {
  // Receiving QC gate: assets minted from a qcRequired PO start at
  // receiving_qc and only become available inventory via qc_pass.
  qc_pass: { from: ["receiving_qc"], to: "in_stock" },
  qc_fail: { from: ["receiving_qc"], to: "damaged" },
  reserve: { from: ["in_stock"], to: "reserved" },
  unreserve: { from: ["reserved"], to: "in_stock" },
  assign: { from: ["in_stock", "reserved"], to: "assigned" },
  unassign: { from: ["assigned"], to: "in_stock" },
  deliver: { from: ["assigned"], to: "delivered" },
  return: { from: ["delivered", "assigned"], to: "returned" },
  restock: { from: ["returned", "damaged"], to: "in_stock" },
  send_maintenance: { from: ["in_stock", "returned", "damaged"], to: "maintenance" },
  repair_done: { from: ["maintenance"], to: "in_stock" },
  mark_damaged: { from: ["in_stock", "returned", "delivered", "maintenance"], to: "damaged" },
  retire: { from: ["in_stock", "returned", "damaged", "maintenance"], to: "retired" },
  sell: { from: ["in_stock", "returned", "retired"], to: "sold" },
  mark_lost: { from: ["delivered", "assigned", "in_stock", "returned"], to: "lost" },
  found: { from: ["lost"], to: "returned" },
  start_supplier_return: { from: ["damaged"], to: "supplier_return_pending" },
  confirm_supplier_return: { from: ["supplier_return_pending"], to: "supplier_returned" },
}

const GUIDED_ACTIONS = new Set<AssetAction>(["start_supplier_return", "confirm_supplier_return"])

// Ownership/return semantics of a unit (order_unit.kind). NOT serialization —
// a sale unit may or may not have a serial (non-serial sold products live in
// qty-stock, not here). A rental unit is company-owned and returns; a sale
// unit is sold to the customer and never re-enters the rental pool.
export type AssetKind = "rental" | "sale"

// Sale units follow a reduced lifecycle: once sold they never return to the
// rental pool, so the rental-return actions are forbidden for them. A sale
// unit that is lost/damaged is handled the same way (damaged/lost) but is
// never "returned" or "restocked" into rentable inventory.
const SALE_FORBIDDEN_ACTIONS: ReadonlySet<AssetAction> = new Set<AssetAction>([
  "return", // rental collection back to warehouse
  "restock", // returned/damaged -> in_stock rental pool
  "found", // lost -> returned (rental limbo)
])

// For sale units, "sell" is the normal completion of the sale and is reachable
// from any live customer-facing state, including the delivered handoff. Rental
// units keep the base rule (sell only surplus stock: in_stock/returned/retired).
const SALE_SELL_FROM: readonly AssetStatus[] = ["in_stock", "reserved", "assigned", "delivered"]

// Terminal states: nothing moves out of them except found (lost) — kept
// explicit here so retire/sell stay auditable one-way doors.
export const TERMINAL_ASSET_STATUSES: AssetStatus[] = ["retired", "sold"]

export function canAssetTransition(
  from: AssetStatus,
  action: AssetAction,
  kind: AssetKind = "rental"
): boolean {
  const rule = TRANSITIONS[action]
  if (!rule) return false
  if (kind === "sale") {
    if (SALE_FORBIDDEN_ACTIONS.has(action)) return false
    if (action === "sell") return SALE_SELL_FROM.includes(from)
  }
  return rule.from.includes(from)
}

export function assetStatusAfter(action: AssetAction): AssetStatus {
  return TRANSITIONS[action].to
}

export function assetActionsFor(status: AssetStatus, kind: AssetKind = "rental"): AssetAction[] {
  return (Object.keys(TRANSITIONS) as AssetAction[]).filter(
    (a) => canAssetTransition(status, a, kind) && !GUIDED_ACTIONS.has(a)
  )
}

// Reverse lookup for callers that only know a (from, to) pair (e.g. a bulk
// data-entry form) rather than the action name. Returns null when no single
// action covers that exact pair — the caller must not silently apply the
// status jump, since it isn't a validated business transition.
export function actionForTransition(from: AssetStatus, to: AssetStatus): AssetAction | null {
  const action = (Object.keys(TRANSITIONS) as AssetAction[]).find(
    (a) => TRANSITIONS[a].to === to && TRANSITIONS[a].from.includes(from)
  )
  return action ?? null
}

// Statuses counted as "available to rent" in inventory views.
export const AVAILABLE_ASSET_STATUSES: AssetStatus[] = ["in_stock"]
// Statuses meaning the device is out with a customer.
export const OUT_ASSET_STATUSES: AssetStatus[] = ["assigned", "delivered"]
