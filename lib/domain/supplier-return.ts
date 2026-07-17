export type SupplierReturnResolution = "replacement" | "refund"
export type SupplierReturnStatus =
  | "requested"
  | "awaiting_replacement"
  | "replacement_received"
  | "resolved"
  | "cancelled"

export type SupplierReturnAction = "confirm_returned" | "receive_replacement"

export function hasUnresolvedSupplierReturns(records: ReadonlyArray<{ status: string }>): boolean {
  return records.some((record) => record.status === "requested" || record.status === "awaiting_replacement")
}

export function supplierReturnStatusAfter(
  status: SupplierReturnStatus,
  action: SupplierReturnAction,
  resolution: SupplierReturnResolution
): SupplierReturnStatus {
  if (action === "confirm_returned" && status === "requested") {
    return resolution === "replacement" ? "awaiting_replacement" : "resolved"
  }
  if (action === "receive_replacement" && status === "awaiting_replacement" && resolution === "replacement") {
    return "replacement_received"
  }
  throw new Error(`Invalid supplier return transition: ${status} -> ${action}`)
}
