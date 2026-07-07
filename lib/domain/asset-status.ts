// Pure asset lifecycle state machine. Server actions call canAssetTransition
// before any write; the UI uses assetActionsFor to render valid buttons only.

export type AssetStatus =
  | "in_stock"
  | "reserved"
  | "assigned"
  | "delivered"
  | "returned"
  | "maintenance"
  | "damaged"
  | "retired"
  | "sold"
  | "lost"

export type AssetAction =
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

// action -> [fromStatuses, toStatus]
const TRANSITIONS: Record<AssetAction, { from: AssetStatus[]; to: AssetStatus }> = {
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
}

// Terminal states: nothing moves out of them except found (lost) — kept
// explicit here so retire/sell stay auditable one-way doors.
export const TERMINAL_ASSET_STATUSES: AssetStatus[] = ["retired", "sold"]

export function canAssetTransition(from: AssetStatus, action: AssetAction): boolean {
  const rule = TRANSITIONS[action]
  if (!rule) return false
  return rule.from.includes(from)
}

export function assetStatusAfter(action: AssetAction): AssetStatus {
  return TRANSITIONS[action].to
}

export function assetActionsFor(status: AssetStatus): AssetAction[] {
  return (Object.keys(TRANSITIONS) as AssetAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(status)
  )
}

// Statuses counted as "available to rent" in inventory views.
export const AVAILABLE_ASSET_STATUSES: AssetStatus[] = ["in_stock"]
// Statuses meaning the device is out with a customer.
export const OUT_ASSET_STATUSES: AssetStatus[] = ["assigned", "delivered"]
