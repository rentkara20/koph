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
  // Which order (and which of its lines) the device is being lent out on. Set
  // together with requestId/customerId when a request pulls the device. This is
  // the CURRENT allocation, never the device's origin — see the currentOrderId
  // comment on order_unit in lib/db/schema.ts.
  orderId?: string | null
  orderLineId?: string | null
}

export interface AssetFieldUpdate {
  status: AssetStatus
  currentRequestId?: string | null
  currentCustomerId?: string | null
  currentOrderId?: string | null
  currentOrderLineId?: string | null
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

  // The whole "current allocation" family moves as one unit: a device is out
  // with a customer, on a request, against an order line — or it is free of all
  // three. Setting or clearing them in separate places is how they drift.
  if (action === "assign") {
    update.currentRequestId = context.requestId ?? null
    update.currentCustomerId = context.customerId ?? null
    update.currentOrderId = context.orderId ?? null
    update.currentOrderLineId = context.orderLineId ?? null
  } else if (CLEARS_ASSIGNMENT.has(action)) {
    update.currentRequestId = null
    update.currentCustomerId = null
    update.currentOrderId = null
    update.currentOrderLineId = null
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
