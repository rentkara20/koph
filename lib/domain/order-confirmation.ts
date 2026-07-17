export type ConfirmableOrderStatus =
  | "draft"
  | "confirmed"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled"

export function statusAfterCustomerConfirmation(
  currentStatus: ConfirmableOrderStatus,
  customerConfirmedOn?: string
): ConfirmableOrderStatus {
  if (currentStatus !== "draft") return currentStatus
  return customerConfirmedOn ? "confirmed" : "draft"
}
