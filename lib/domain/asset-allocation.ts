// Resolving which order line a device is being lent out on.
//
// A delivery request names its order by number (request.quoteNumber), not by id,
// and its items carry a description rather than a line id. To record the current
// allocation (order_unit.currentOrderId / currentOrderLineId) we therefore have
// to map: order number -> order, and item description -> that order's rental
// line. Kept here as pure functions so the matching rule is testable and stated
// once, instead of being re-improvised at each call site.

export interface AllocatableLine {
  id: string
  description: string
  type: "rental_asset" | "sold_product"
}

// Line descriptions are entered by hand across quotes and vary in case and
// spacing ("Apple iPad A16, Wi-Fi..." vs "iPad A16, Wi-fi..."), so an exact
// match would miss most real pairs.
function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * The line of `lines` that `description` belongs to, or null when the match is
 * not unambiguous. Null is a valid outcome: the allocation is then recorded at
 * order level only (currentOrderId set, line left null) rather than guessing a
 * line and corrupting per-line coverage numbers.
 *
 * `kind` selects the eligible lines: a rental asset can only sit on a
 * rental_asset line, a sale unit only on a sold_product line. Mixing them would
 * put a rented device on a line the customer bought outright.
 */
export function matchAllocationLine(
  description: string | null | undefined,
  lines: AllocatableLine[],
  kind: "rental" | "sale" = "rental",
): string | null {
  if (!description) return null
  const wantedType = kind === "sale" ? "sold_product" : "rental_asset"
  const rentalLines = lines.filter((l) => l.type === wantedType)
  if (rentalLines.length === 0) return null

  const target = normalise(description)
  const exact = rentalLines.filter((l) => normalise(l.description) === target)
  if (exact.length === 1) return exact[0].id

  // Fall back to token containment: every meaningful word of the shorter name
  // must appear in the longer one. Real pairs differ by an "Apple" prefix and by
  // mid-string specs ("11-inch"), which plain substring matching cannot bridge —
  // "iPad A16, Wi-fi, Storage 128GB" is not a substring of "Apple iPad A16,
  // Wi-Fi, 11-inch, Storage 128GB", yet they are the same device.
  //
  // Distinguishing specs (128GB vs 256GB) are tokens too, so they still keep
  // genuinely different models apart. Ambiguity means no answer.
  const targetTokens = tokenise(description)
  if (targetTokens.size === 0) return null
  const partial = rentalLines
    .map((l) => ({ line: l, tokens: tokenise(l.description) }))
    .filter(({ tokens }) => isSubset(targetTokens, tokens) || isSubset(tokens, targetTokens))
  if (partial.length === 1) return partial[0].line.id

  // Several lines can be compatible when one is a broader version of another:
  // "iPhone 16 Pro, Storage 256GB" fits both an "iPhone 16 Pro" line and an
  // "iPhone 16" line. The MOST SPECIFIC line wins — it names more of the device
  // — and a genuine tie (equally specific rivals) still refuses to guess.
  if (partial.length > 1) {
    const ranked = [...partial].sort((a, b) => b.tokens.size - a.tokens.size)
    const [best, runnerUp] = ranked
    if (best.tokens.size > runnerUp.tokens.size) return best.line.id
  }

  // Deliberately no "it is the only line, so it must be that one" fallback: a
  // lone line is still the wrong home for a different device, and getting that
  // wrong corrupts the line's coverage silently. One clear match or none.
  return null
}

// Words that carry no distinguishing information; keeping them would let two
// different models look alike on the strength of shared punctuation words.
const NOISE = new Set(["the", "and", "with", "for", "inch", "gen"])

function tokenise(value: string): Set<string> {
  return new Set(
    normalise(value)
      .split(/[^a-z0-9.]+/)
      .filter((token) => token.length > 0 && !NOISE.has(token)),
  )
}

function isSubset(inner: Set<string>, outer: Set<string>): boolean {
  for (const token of inner) if (!outer.has(token)) return false
  return true
}
