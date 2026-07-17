// The Asset Transition Chokepoint (OI-1). This is the ONLY supported way to
// change an order_unit's status in a business workflow. It guarantees, atomically
// inside the given transaction:
//   1. the transition is allowed for the asset's current status
//   2. the status update is concurrency-safe (guarded on the status just read)
//   3. an asset_event row is written for every successful transition
//   4. all three happen in the same transaction — no partial/orphaned writes
//
// `transitionAsset` (lib/actions/assets.ts) is a thin wrapper around this for
// the admin-triggered single-asset action. Business workflows (request
// creation, task close, maintenance, etc.) call applyAssetTransition directly
// so they can pass request/customer context and stay inside their own tx.
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { orderUnits, assetEvents } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import {
  canAssetTransition,
  actionForTransition,
  type AssetAction,
  type AssetStatus,
} from "@/lib/domain/asset-status"
import { planAssetFieldUpdate, eventTypeForAction, type TransitionContext } from "@/lib/domain/asset-transition-plan"
import { domainEventTypeForAssetAction } from "@/lib/domain/domain-events"
import { emitDomainEvent } from "@/lib/actions/domain-events"

export type AssetTransitionErrorCode = "NOT_FOUND" | "INVALID_TRANSITION" | "CONCURRENT_MODIFICATION"

// Thrown by applyAssetTransition. Carries both English and Arabic messages so
// callers can surface either to the user without a second translation pass.
export class AssetTransitionError extends Error {
  code: AssetTransitionErrorCode
  messageAr: string

  constructor(code: AssetTransitionErrorCode, message: string, messageAr: string) {
    super(message)
    this.name = "AssetTransitionError"
    this.code = code
    this.messageAr = messageAr
  }
}

export interface AssetTransitionContext extends TransitionContext {
  byUserId?: string | null
}

export interface AssetTransitionResult {
  assetId: string
  fromStatus: AssetStatus
  toStatus: AssetStatus
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const ASSET_NOT_FOUND = new AssetTransitionError("NOT_FOUND", "Asset not found", "الجهاز غير موجود")

/**
 * Apply a validated asset-lifecycle transition inside `tx`. Throws
 * AssetTransitionError on any failure — callers decide how to translate that
 * into their own ActionResult shape. Never partially applies: either the
 * status update AND the event both land, or neither does (transaction abort).
 */
export async function applyAssetTransition(
  tx: Tx,
  assetId: string,
  action: AssetAction,
  context: AssetTransitionContext = {}
): Promise<AssetTransitionResult> {
  const [unit] = await tx.select().from(orderUnits).where(eq(orderUnits.id, assetId))
  if (!unit) throw ASSET_NOT_FOUND

  const from = unit.status as AssetStatus
  const kind = (unit.kind ?? "rental") as "rental" | "sale"
  if (!canAssetTransition(from, action, kind)) {
    throw new AssetTransitionError(
      "INVALID_TRANSITION",
      `Cannot perform "${action}" on an asset in status "${from}"`,
      `لا يمكن تنفيذ الإجراء "${action}" على جهاز في حالة "${from}"`
    )
  }

  const plan = planAssetFieldUpdate(action, context, Date.now())

  // Concurrency-safe: the WHERE re-checks the exact status we validated
  // against, so a racing writer that already moved this asset causes 0 rows
  // affected here instead of silently clobbering their change.
  const result = await tx
    .update(orderUnits)
    .set({
      status: plan.status,
      updatedAt: Date.now(),
      ...(plan.currentRequestId !== undefined ? { currentRequestId: plan.currentRequestId } : {}),
      ...(plan.currentCustomerId !== undefined ? { currentCustomerId: plan.currentCustomerId } : {}),
      ...(plan.location !== undefined ? { location: plan.location } : {}),
      ...(plan.retiredAt !== undefined ? { retiredAt: plan.retiredAt, retirementReason: plan.retirementReason } : {}),
    })
    .where(and(eq(orderUnits.id, assetId), eq(orderUnits.status, from)))

  const changed = (result as { rowsAffected?: number }).rowsAffected ?? 1
  if (changed === 0) {
    throw new AssetTransitionError(
      "CONCURRENT_MODIFICATION",
      "Asset status changed since it was loaded — please retry",
      "تم تغيير حالة الجهاز منذ تحميلها — يرجى إعادة المحاولة"
    )
  }

  const assetEventId = createId()
  await tx.insert(assetEvents).values({
    id: assetEventId,
    assetId,
    type: eventTypeForAction(action),
    fromStatus: from,
    toStatus: plan.status,
    requestId: plan.currentRequestId !== undefined ? plan.currentRequestId : (context.requestId ?? unit.currentRequestId),
    customerId: plan.currentCustomerId !== undefined ? plan.currentCustomerId : (context.customerId ?? unit.currentCustomerId),
    notes: context.notes ?? null,
    byUserId: context.byUserId ?? null,
  })

  const domainEventType = domainEventTypeForAssetAction(action)
  if (domainEventType) {
    await emitDomainEvent(tx, {
      aggregateType: "asset",
      aggregateId: assetId,
      eventType: domainEventType,
      payload: { fromStatus: from, toStatus: plan.status, requestId: context.requestId ?? null, customerId: context.customerId ?? null },
      dedupeKey: `asset:${assetId}:${action}:${assetEventId}`,
      actorUserId: context.byUserId ?? null,
    })
  }

  return { assetId, fromStatus: from, toStatus: plan.status }
}

/**
 * For callers that only know a target status (e.g. a bulk inventory editor),
 * not the business action name. Delegates to applyAssetTransition when the
 * (from, to) pair matches exactly one known action; otherwise records an
 * explicit, audited admin override (asset_event type "correction") rather
 * than silently allowing a status jump that bypasses the state machine.
 */
export async function applyAssetStatusCorrection(
  tx: Tx,
  assetId: string,
  toStatus: AssetStatus,
  context: AssetTransitionContext = {}
): Promise<AssetTransitionResult> {
  const [unit] = await tx.select().from(orderUnits).where(eq(orderUnits.id, assetId))
  if (!unit) throw ASSET_NOT_FOUND

  const from = unit.status as AssetStatus
  if (from === toStatus) return { assetId, fromStatus: from, toStatus }

  const matchedAction = actionForTransition(from, toStatus)
  if (matchedAction) return applyAssetTransition(tx, assetId, matchedAction, context)

  await tx
    .update(orderUnits)
    .set({ status: toStatus, updatedAt: Date.now() })
    .where(eq(orderUnits.id, assetId))

  const correctionEventId = createId()
  await tx.insert(assetEvents).values({
    id: correctionEventId,
    assetId,
    type: "correction",
    fromStatus: from,
    toStatus,
    notes: context.notes ?? null,
    byUserId: context.byUserId ?? null,
  })

  await emitDomainEvent(tx, {
    aggregateType: "asset",
    aggregateId: assetId,
    eventType: "AssetStatusCorrected",
    payload: { fromStatus: from, toStatus, notes: context.notes ?? null },
    dedupeKey: `asset:${assetId}:AssetStatusCorrected:${correctionEventId}`,
    actorUserId: context.byUserId ?? null,
  })

  return { assetId, fromStatus: from, toStatus }
}
