// Sourcing comparison math (Sourcing V2 Phase 5). Pure helpers to normalise a
// quotation line's price for apples-to-apples comparison and to flag the
// cheapest / fastest candidate per item. Badges are informational only — the
// operator always picks the winner and states a reason; nothing here awards
// anything. Cross-currency is never silently compared: cheapest is decided
// only among lines sharing a currency.

export type ComparisonLine = {
  quotationLineId: string
  currency: string
  unitPrice: number | null
  taxRate: number | null
  qty: number
  upgradesCost: number | null
  leadTimeDays: number | null
}

export type ComparisonBadges = {
  cheapestLineId: string | null
  fastestLineId: string | null
}

// Unit price including tax. Null price → null (nothing to compare).
export function normalizedUnitPrice(unitPrice: number | null, taxRate: number | null): number | null {
  if (unitPrice == null) return null
  const rate = taxRate ?? 0
  return unitPrice * (1 + rate / 100)
}

// Total for the line: tax-inclusive unit price × quantity + upgrade cost.
export function lineTotal(line: ComparisonLine): number | null {
  const unit = normalizedUnitPrice(line.unitPrice, line.taxRate)
  if (unit == null) return null
  return unit * line.qty + (line.upgradesCost ?? 0)
}

// Cheapest: lowest tax-inclusive total, compared only among lines in the
// dominant currency (the currency the most priced lines use). Comparing SAR
// against USD numerically would be meaningless, so a mixed-currency shop-out
// stays a manual call — which is why badges are advisory only.
// Fastest: lowest lead time, across all lines. Ties resolve to the first line
// seen (stable order).
export function computeBadges(lines: ComparisonLine[]): ComparisonBadges {
  const priced = lines.filter((l) => lineTotal(l) != null)

  const currencyCounts = new Map<string, number>()
  for (const line of priced) {
    currencyCounts.set(line.currency, (currencyCounts.get(line.currency) ?? 0) + 1)
  }
  let dominantCurrency: string | null = null
  let dominantCount = 0
  for (const [currency, count] of currencyCounts) {
    if (count > dominantCount) {
      dominantCurrency = currency
      dominantCount = count
    }
  }

  let cheapestLineId: string | null = null
  let cheapestTotal = Number.POSITIVE_INFINITY
  for (const line of priced) {
    if (line.currency !== dominantCurrency) continue
    const total = lineTotal(line) as number
    if (total < cheapestTotal) {
      cheapestLineId = line.quotationLineId
      cheapestTotal = total
    }
  }

  let fastestLineId: string | null = null
  let fastestLead = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (line.leadTimeDays == null) continue
    if (line.leadTimeDays < fastestLead) {
      fastestLineId = line.quotationLineId
      fastestLead = line.leadTimeDays
    }
  }

  return { cheapestLineId, fastestLineId }
}
