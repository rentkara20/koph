// Partners often hold several contracts at different rates (Delivery 40,
// Hardware Services 15). A form that lists them in query order with no default
// makes it easy to assign the wrong rate, and the mistake is silent — nothing
// downstream flags that a delivery was billed at the installation rate.
//
// Ordering and preselection live here rather than in each form so the three
// assign surfaces (task assignment, follow-up delivery, supplier pickup) cannot
// drift apart on which contract they consider the obvious one.

export type ContractLike = {
  contractId: string | null
  contractName: string | null
  serviceTypeId?: string | null
}

// Contracts whose service type matches the request's come first, alphabetical
// within each group so the order is stable regardless of how the query returned
// them. Pure and non-mutating — callers pass their own array safely.
export function orderContractsForServiceType<T extends ContractLike>(
  contracts: readonly T[],
  serviceTypeId: string | null | undefined
): T[] {
  return [...contracts].sort((a, b) => {
    const aMatch = serviceTypeId != null && a.serviceTypeId === serviceTypeId
    const bMatch = serviceTypeId != null && b.serviceTypeId === serviceTypeId
    if (aMatch !== bMatch) return aMatch ? -1 : 1
    return (a.contractName ?? "").localeCompare(b.contractName ?? "")
  })
}

// The contract to preselect, or "" for none. Deliberately conservative: it only
// returns a contract that genuinely matches the service type, so a partner with
// no matching contract falls back to "no contract" rather than being assigned an
// unrelated rate the user never chose. Ambiguity (two contracts on the same
// service type) resolves to the alphabetically first — a human picking from the
// same list faces the same tie, and the rate is shown in the option label.
export function preselectedContractId<T extends ContractLike>(
  orderedContracts: readonly T[],
  serviceTypeId: string | null | undefined
): string {
  if (serviceTypeId == null) return ""
  const top = orderedContracts[0]
  if (!top || top.serviceTypeId !== serviceTypeId) return ""
  return top.contractId ?? ""
}
