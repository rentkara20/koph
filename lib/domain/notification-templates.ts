// Pure mapping: domain event → admin notification template. No I/O here — the
// consumer (lib/actions/notification-consumer.ts) resolves recipients and
// writes rows. Returning null means "this event produces no notification".
//
// Audience is always the admin cohort: the notification bell lives only in the
// admin layout (app/admin/layout.tsx), so partner/customer users never see
// in-app notifications. The consumer excludes the actor who caused the event.
import type { DomainEventType } from "@/lib/domain/domain-events"

export interface NotificationTemplate {
  /** notification.type taxonomy value */
  type: string
  /** next-intl key under `notifications.*` */
  i18nKey: string
  /** interpolation data — built only from the event payload (no DB lookups) */
  i18nData?: Record<string, string | number>
  entityType?: string
  entityId?: string
}

export interface EventContext {
  aggregateType: string
  aggregateId: string
  payload: Record<string, unknown>
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined
}

// Where clicking a notification navigates, derived from the aggregate. Kept
// here so link logic and message stay in one place. requestId in the payload
// (signatures, tasks) points at the owning request page.
export function notificationLinkUrl(ctx: EventContext): string | undefined {
  const requestId = str(ctx.payload.requestId)
  switch (ctx.aggregateType) {
    case "request":
      return `/admin/requests/${ctx.aggregateId}`
    case "asset":
      return `/admin/assets/${ctx.aggregateId}`
    case "payment_batch":
      return `/admin/payments/${ctx.aggregateId}`
    case "partner_payment":
      return "/admin/payments"
    case "purchase_order":
      return `/admin/procurement/${ctx.aggregateId}`
    case "signature_request":
      return requestId ? `/admin/requests/${requestId}` : "/admin/signatures"
    case "task":
      return requestId ? `/admin/requests/${requestId}` : "/admin/requests"
    default:
      return undefined
  }
}

// Curated set of user-facing events. Deliberately excludes high-frequency,
// low-signal internal transitions (asset reserve/assign/deliver, accessory
// attach/return, RequestStatusChanged, AssetCreated, SignatureSent,
// PurchaseOrderCreated, WarrantyAssigned) to keep the bell useful.
type TemplateFn = (ctx: EventContext) => NotificationTemplate | null

const TEMPLATES: Partial<Record<DomainEventType, TemplateFn>> = {
  RequestCreated: (ctx) => ({
    type: "request_created",
    i18nKey: "notifications.requestCreated",
    i18nData: { requestNumber: str(ctx.payload.requestNumber) ?? "" },
    entityType: "request",
    entityId: ctx.aggregateId,
  }),

  SignatureCompleted: (ctx) => {
    const isFinal = str(ctx.payload.signatoryRole) === "authorized"
    return {
      type: isFinal ? "fully_signed" : "customer_signed",
      i18nKey: isFinal ? "notifications.fullySigned" : "notifications.customerSigned",
      entityType: "signature_request",
      entityId: ctx.aggregateId,
    }
  },
  SignatureRejected: (ctx) => ({
    type: "signature_rejected",
    i18nKey: "notifications.signatureRejected",
    entityType: "signature_request",
    entityId: ctx.aggregateId,
  }),

  PaymentBatchGenerated: (ctx) => ({
    type: "payment_batch_generated",
    i18nKey: "notifications.paymentBatchGenerated",
    i18nData: { paymentCount: num(ctx.payload.paymentCount) ?? 0 },
    entityType: "payment_batch",
    entityId: ctx.aggregateId,
  }),
  PaymentBatchApproved: (ctx) => ({
    type: "payment_batch_approved",
    i18nKey: "notifications.paymentBatchApproved",
    entityType: "payment_batch",
    entityId: ctx.aggregateId,
  }),
  PaymentBatchSent: (ctx) => ({
    type: "payment_batch_sent",
    i18nKey: "notifications.paymentBatchSent",
    entityType: "payment_batch",
    entityId: ctx.aggregateId,
  }),
  PaymentBatchPaid: (ctx) => ({
    type: "payment_batch_paid",
    i18nKey: "notifications.paymentBatchPaid",
    entityType: "payment_batch",
    entityId: ctx.aggregateId,
  }),
  PaymentHeld: (ctx) => ({
    type: "payment_held",
    i18nKey: "notifications.paymentHeld",
    entityType: "partner_payment",
    entityId: ctx.aggregateId,
  }),
  PaymentReleased: (ctx) => ({
    type: "payment_released",
    i18nKey: "notifications.paymentReleased",
    entityType: "partner_payment",
    entityId: ctx.aggregateId,
  }),

  PurchaseOrderLineReceived: (ctx) => ({
    type: "po_line_received",
    i18nKey: "notifications.poLineReceived",
    entityType: "purchase_order",
    entityId: ctx.aggregateId,
  }),

  WarrantyActivated: (ctx) => ({
    type: "warranty_activated",
    i18nKey: "notifications.warrantyActivated",
    entityType: "asset",
    entityId: ctx.aggregateId,
  }),

  TaskPendingSignoff: (ctx) => ({
    type: "task_pending_signoff",
    i18nKey: "notifications.taskPendingSignoff",
    entityType: "task",
    entityId: ctx.aggregateId,
  }),
  TaskRejected: (ctx) => ({
    type: "task_rejected",
    i18nKey: "notifications.taskRejected",
    entityType: "task",
    entityId: ctx.aggregateId,
  }),
  TaskFailed: (ctx) => ({
    type: "task_failed",
    i18nKey: "notifications.taskFailed",
    entityType: "task",
    entityId: ctx.aggregateId,
  }),
  TaskCancelled: (ctx) => ({
    type: "task_cancelled",
    i18nKey: "notifications.taskCancelled",
    entityType: "task",
    entityId: ctx.aggregateId,
  }),
}

/**
 * Build the admin notification template for a domain event, or null when the
 * event type is not one we surface. Pure and deterministic.
 */
export function notificationTemplateForEvent(
  eventType: string,
  ctx: EventContext
): NotificationTemplate | null {
  const fn = TEMPLATES[eventType as DomainEventType]
  return fn ? fn(ctx) : null
}
