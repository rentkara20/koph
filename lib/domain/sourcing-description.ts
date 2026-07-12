// Pure helpers for the two-tier description model on a sourcing item.
// customerDescription = final delivered config; supplierDescription = RFQ spec.
// When the two are meant to be identical, the UI mirrors customer → supplier
// instead of persisting a redundant "same as" flag. These helpers keep that
// derivation in one testable place, shared by the create form and any importer.

/**
 * The supplier description actually sent to the server. When mirroring is on,
 * the supplier spec IS the customer spec; otherwise the independently-typed
 * value stands.
 */
export function resolveSupplierDescription(
  sameAsCustomer: boolean,
  customerDescription: string,
  supplierDescription: string
): string {
  return sameAsCustomer ? customerDescription : supplierDescription
}

/**
 * Whether an existing record's two descriptions are equal (trim-insensitive).
 * Used to initialise the mirror checkbox when editing: equal → checked.
 */
export function isSameDescription(
  customerDescription: string,
  supplierDescription: string
): boolean {
  return customerDescription.trim() === supplierDescription.trim()
}

type Mirrorable = {
  customerDescription: string
  supplierDescription: string
  sameAsCustomer: boolean
}

/**
 * Apply a toggle of the "same as customer" mirror on a single item.
 * Turning it OFF freezes the currently-visible (mirrored) value as the starting
 * point for independent editing; turning it ON leaves the stored supplier value
 * untouched (the mirror is re-derived at read time via
 * resolveSupplierDescription). Pure — returns a new object, never mutates.
 */
export function applySameAsToggle<T extends Mirrorable>(item: T, sameAsCustomer: boolean): T {
  if (!sameAsCustomer) {
    return { ...item, sameAsCustomer, supplierDescription: item.customerDescription }
  }
  return { ...item, sameAsCustomer }
}

/**
 * The stored `description` column, which also serves as the display-label
 * fallback rendered when `title` is blank. Returns the first non-empty, trimmed
 * candidate so a heading can never render as an empty string. Order:
 * notes → title → first item's customer description → request ref.
 */
export function sourcingRequestDescription(parts: {
  notes?: string | null
  title?: string | null
  firstItemCustomerDescription?: string | null
  externalRef?: string | null
}): string {
  const candidates = [
    parts.notes,
    parts.title,
    parts.firstItemCustomerDescription,
    parts.externalRef,
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value) return value
  }
  return "—"
}
