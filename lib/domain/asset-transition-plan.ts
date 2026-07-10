// Pure decision logic for applyAssetTransition (lib/actions/asset-transition.ts),
// extracted so the field-mapping rules can be unit-tested without a DB. Given an
// action and its current assignment context, decides exactly what changes on
// order_unit and what the resulting asset_event should record. No I/O here.

import { assetStatusAfter, type AssetAction, type AssetStatus } from "./asset-status"

export interface TransitionContext {
  requestId?: string | null
  customerId?: string | null
  notes?: string | null
  location?: string | null
}

export interface AssetFieldUpdate {
  status: AssetStatus
  currentRequestId?: string | null
  currentCustomerId?: string | null
  location?: string
  retiredAt?: number
  retirementReason?: string | null
}

export type AssetEventType =
  | "status_change"
  | "assigned"
  | "delivered"
  | "returned"
  | "maintenance"
  | "retired"

const CLEARS_ASSIGNMENT: ReadonlySet<AssetAction> = new Set(["restock", "unassign", "return", "repair_done"])
const RESETS_LOCATION: ReadonlySet<AssetAction> = new Set(["restock", "repair_done"])
const RETIRES: ReadonlySet<AssetAction> = new Set(["retire", "sell"])

const EVENT_TYPE_BY_ACTION: Partial<Record<AssetAction, AssetEventType>> = {
  assign: "assigned",
  deliver: "delivered",
  return: "returned",
  send_maintenance: "maintenance",
  retire: "retired",
}

export function eventTypeForAction(action: AssetAction): AssetEventType {
  return EVENT_TYPE_BY_ACTION[action] ?? "status_change"
}

// nowMs is passed in (not read from Date.now() here) so this stays a pure,
// deterministic function — callers pass the real timestamp.
export function planAssetFieldUpdate(
  action: AssetAction,
  context: TransitionContext,
  nowMs: number
): AssetFieldUpdate {
  const status = assetStatusAfter(action)
  const update: AssetFieldUpdate = { status }

  if (action === "assign") {
    update.currentRequestId = context.requestId ?? null
    update.currentCustomerId = context.customerId ?? null
  } else if (CLEARS_ASSIGNMENT.has(action)) {
    update.currentRequestId = null
    update.currentCustomerId = null
  }

  if (RESETS_LOCATION.has(action)) {
    update.location = context.location ?? "main_warehouse"
  }

  if (RETIRES.has(action)) {
    update.retiredAt = nowMs
    update.retirementReason = context.notes ?? null
  }

  return update
}
