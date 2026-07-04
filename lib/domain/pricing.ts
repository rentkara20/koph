// Pure payment-amount computation, extracted from signOffTask so it can be
// unit-tested independently of the DB/session.

export type PricingModel = "per_order" | "per_item" | "per_day" | "per_hour" | "fixed"

// Flat models bill once per task regardless of quantity; the rest bill per unit.
export function isFlatPricing(model: PricingModel): boolean {
  return model === "per_order" || model === "fixed"
}

// Whether a quantity must be supplied for this model (non-flat models need it).
export function requiresQuantity(model: PricingModel): boolean {
  return !isFlatPricing(model)
}

export function computePayment(
  model: PricingModel,
  unitPrice: number,
  quantity?: number
): { quantity: number; totalAmount: number } {
  const finalQty = isFlatPricing(model) ? 1 : quantity ?? 1
  return { quantity: finalQty, totalAmount: finalQty * unitPrice }
}
