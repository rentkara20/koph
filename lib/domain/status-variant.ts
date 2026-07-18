// Central status -> Badge variant registry. One merged record covers every
// known status across domains; where two domains use the same status word
// with DIFFERENT tones (e.g. PO "draft" is secondary while payment-batch
// "draft" is outline), domain-scoped records below carry the overrides.
// Pages import the domain record matching their entity so visuals are
// byte-identical to the previous page-local maps.

export type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "outline"

// ---------------------------------------------------------------------------
// Domain records (exact tones preserved from the pages they replaced)
// ---------------------------------------------------------------------------

// Payment batch lifecycle (payments pages, reports, statement portals).
export const paymentBatchStatusVariant: Record<string, BadgeVariant> = {
  draft: "outline",
  approved: "info",
  sent_to_finance: "warning",
  paid: "success",
}

// E-signature request lifecycle (admin signatures list + public /sign page).
export const signatureStatusVariant: Record<string, BadgeVariant> = {
  draft: "outline",
  sent: "info",
  opened: "info",
  otp_verified: "info",
  signed: "success",
  rejected: "secondary",
  expired: "secondary",
  cancelled: "secondary",
}

// Customer request status as rendered in admin search + reports.
export const adminRequestStatusVariant: Record<string, BadgeVariant> = {
  draft: "outline",
  assigned: "info",
  in_progress: "warning",
  completed: "success",
  failed: "destructive",
  on_hold: "secondary",
  cancelled: "secondary",
  rescheduled: "outline",
}

// Customer request status in the client portal (confirmed instead of assigned).
export const clientRequestStatusVariant: Record<string, BadgeVariant> = {
  draft: "outline",
  confirmed: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "secondary",
  on_hold: "secondary",
}

// Partner account status (admin search).
export const partnerStatusVariant: Record<string, BadgeVariant> = {
  active: "success",
  inactive: "secondary",
  suspended: "outline",
}

// Purchase order lifecycle (procurement list + detail).
export const poStatusVariant: Record<string, BadgeVariant> = {
  draft: "secondary",
  ordered: "default",
  partially_received: "warning",
  received: "success",
  cancelled: "destructive",
}

// Supplier-pickup partner task as shown on the PO detail page.
export const pickupTaskStatusVariant: Record<string, BadgeVariant> = {
  pending: "secondary",
  accepted: "default",
  arrived: "default",
  picked_up: "warning",
  closed: "success",
  rejected: "destructive",
  failed: "destructive",
  cancelled: "destructive",
}

// Partner contract status (partner detail page).
export const contractStatusVariant: Record<string, BadgeVariant> = {
  active: "success",
  expired: "secondary",
  cancelled: "destructive",
}

// Maintenance order lifecycle.
export const maintenanceStatusVariant: Record<string, BadgeVariant> = {
  open: "outline",
  in_progress: "info",
  done: "success",
  cancelled: "secondary",
}

// Sourcing request lifecycle (sourcing list + detail header).
export const sourcingStatusVariant: Record<string, BadgeVariant> = {
  draft: "secondary",
  rfq_sent: "default",
  quotes_received: "default",
  under_evaluation: "warning",
  approved: "success",
  handed_off: "success",
  rejected: "destructive",
  cancelled: "destructive",
  closed: "secondary",
}

// Sourcing request item (derived) status.
export const sourcingItemStatusVariant: Record<string, BadgeVariant> = {
  pending: "secondary",
  rfq_sent: "default",
  quoted: "warning",
  selected: "success",
  not_sourced: "destructive",
  cancelled: "destructive",
}

// Procurement case status (case panel component).
export const procurementCaseStatusVariant: Record<string, BadgeVariant> = {
  open: "default",
  handed_off: "default",
  po_linked: "success",
  closed: "secondary",
  cancelled: "destructive",
  superseded: "destructive",
}

// Warranty lifecycle (asset detail warranty card).
export const warrantyStatusVariant: Record<string, BadgeVariant> = {
  assigned_not_activated: "warning",
  activation_pending: "warning",
  active: "success",
  expired: "destructive",
  cancelled: "secondary",
  unknown: "secondary",
}

// Per-asset warranty registry (lib/actions/warranty.ts getWarrantyRegistry) —
// "none" is its own bucket, distinct from the batch-lifecycle statuses above.
export const warrantyRegistryStatusVariant: Record<string, BadgeVariant> = {
  none: "destructive",
  pending: "warning",
  active: "success",
  expiring_soon: "warning",
  expired: "destructive",
}

// Accessory checklist state (asset detail accessories card).
export const accessoryStateVariant: Record<string, BadgeVariant> = {
  delivered: "default",
  collected: "success",
  missing: "destructive",
  damaged: "destructive",
}

// ---------------------------------------------------------------------------
// Merged lookup. Later spreads win on conflicting keys; the order below picks
// the most common tone per word across the app (request/task tones dominate).
// Prefer the domain records above when you know the entity — this generic
// lookup is for surfaces mixing statuses from many domains.
// ---------------------------------------------------------------------------

const MERGED_STATUS_VARIANT: Record<string, BadgeVariant> = {
  ...poStatusVariant,
  ...pickupTaskStatusVariant,
  ...procurementCaseStatusVariant,
  ...sourcingStatusVariant,
  ...sourcingItemStatusVariant,
  ...warrantyStatusVariant,
  ...accessoryStateVariant,
  ...maintenanceStatusVariant,
  ...contractStatusVariant,
  ...partnerStatusVariant,
  ...clientRequestStatusVariant,
  ...adminRequestStatusVariant,
  ...signatureStatusVariant,
  ...paymentBatchStatusVariant,
}

export function statusVariant(status: string): BadgeVariant {
  return MERGED_STATUS_VARIANT[status] ?? "secondary"
}
