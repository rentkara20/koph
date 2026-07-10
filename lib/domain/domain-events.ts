// Pure domain logic for the OI-2 transactional outbox: consumer registry,
// retry backoff schedule, and dedupe-key construction. No I/O here — the
// actual DB writes live in lib/actions/domain-events.ts.

export const CONSUMERS = ["projections", "notifications"] as const
export type Consumer = (typeof CONSUMERS)[number]

export const MAX_DELIVERY_ATTEMPTS = 6

// Exponential backoff in ms, capped. attempt is the number of attempts already
// made (0 before the first try). Index 0 = delay before the 2nd attempt, etc.
const RETRY_SCHEDULE_MS = [30_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]

export function nextRetryDelayMs(attempt: number): number {
  const index = Math.min(attempt, RETRY_SCHEDULE_MS.length - 1)
  return RETRY_SCHEDULE_MS[Math.max(index, 0)]
}

export function isDead(attempts: number): boolean {
  return attempts >= MAX_DELIVERY_ATTEMPTS
}

export function buildDedupeKey(aggregateType: string, aggregateId: string, eventType: string, suffix?: string): string {
  const parts = [aggregateType, aggregateId, eventType]
  if (suffix) parts.push(suffix)
  return parts.join(":")
}

const ASSET_ACTION_EVENT_TYPE: Partial<Record<string, string>> = {
  reserve: "AssetReserved",
  unreserve: "AssetUnreserved",
  assign: "AssetAssigned",
  unassign: "AssetUnassigned",
  deliver: "AssetDelivered",
  return: "AssetReturned",
  restock: "AssetRestocked",
  send_maintenance: "AssetMaintenanceOpened",
  repair_done: "AssetMaintenanceClosed",
  mark_damaged: "AssetDamaged",
  retire: "AssetRetired",
  sell: "AssetSold",
  mark_lost: "AssetLost",
  found: "AssetFound",
}

// Every asset action now maps to a domain event (OI-2 coverage closure) —
// null is only possible for an action string outside the known AssetAction set.
export function domainEventTypeForAssetAction(action: string): DomainEventType | null {
  const type = ASSET_ACTION_EVENT_TYPE[action]
  return (type as DomainEventType) ?? null
}

const TASK_ACTION_EVENT_TYPE: Partial<Record<string, string>> = {
  accept: "TaskAccepted",
  start: "TaskStarted",
  mark_done: "TaskPendingSignoff",
  reject: "TaskRejected",
  mark_failed: "TaskFailed",
}

export function domainEventTypeForTaskAction(action: string): DomainEventType | null {
  const type = TASK_ACTION_EVENT_TYPE[action]
  return (type as DomainEventType) ?? null
}

export const DOMAIN_EVENT_TYPES = [
  "AssetReserved",
  "AssetUnreserved",
  "AssetAssigned",
  "AssetUnassigned",
  "AssetDelivered",
  "AssetReturned",
  "AssetRestocked",
  "AssetMaintenanceOpened",
  "AssetMaintenanceClosed",
  "AssetDamaged",
  "AssetRetired",
  "AssetSold",
  "AssetLost",
  "AssetFound",
  "AssetStatusCorrected",
  "RequestCreated",
  "RequestAssigned",
  "RequestCompleted",
  "RequestStatusChanged",
  "TaskClosed",
  "TaskAccepted",
  "TaskStarted",
  "TaskPendingSignoff",
  "TaskRejected",
  "TaskFailed",
  "TaskCancelled",
  "SignatureSent",
  "SignatureCompleted",
  "SignatureRejected",
  "SignatureCancelled",
  "PartnerPaymentCreated",
  "PaymentBatchGenerated",
  "PaymentBatchApproved",
  "PaymentBatchSent",
  "PaymentBatchPaid",
  "PaymentHeld",
  "PaymentReleased",
] as const
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number]
