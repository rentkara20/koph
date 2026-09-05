// Do two device names describe the same model?
//
// Substituting a device for an equivalent one is normal business, so this rule
// never blocks an allocation. It decides where the UI puts a device (exact
// matches first, substitutes under their own heading behind a confirmation)
// and it is what the allocation invariant audit reports on.
//
// It lives here, in the domain layer, because the answer must be identical in
// three places: the adopt panel, the server action that warns about a
// substitution, and scripts/audit-invariants.mts. When the rule lived inside
// the panel component, the server had no opinion at all — which is how two
// iPad Pros were allocated to an iPad 10th Gen line on order 10760 with
// nothing anywhere to notice (2026-08-30).

// Words that carry no model information — dropping them keeps
// "iPad Pro 11-inch" and "iPad Pro, 11 inch" the same model.
const NOISE = new Set(["inch", "gen", "with", "and"])

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      // Drop ordinal suffixes and split digits from letters, so "10thGen" and
      // "10th Gen" tokenise identically. Without this the two names for the
      // SAME iPad never matched, every correct device was filed under "other
      // models", and the section headings stopped meaning anything.
      .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
      .replace(/(\d)(st|nd|rd|th)(?=[a-z])/g, "$1")
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .split(/[^a-z0-9.]+/)
      .filter((token) => token.length > 0 && !NOISE.has(token)),
  )
}

/**
 * True when every meaningful word of the shorter name appears in the longer
 * one — so a stored name may be more specific than the ordered one ("iPad Pro
 * 11-inch, M4, Storage 256GB, Wi-Fi" matches "iPad Pro, 11-inch, Wi-Fi,
 * Storage 256GB") without two different models ever collapsing together.
 */
export function isSameModel(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const left = tokens(a)
  const right = tokens(b)
  if (left.size === 0 || right.size === 0) return false
  const [inner, outer] = left.size <= right.size ? [left, right] : [right, left]
  for (const token of inner) if (!outer.has(token)) return false
  return true
}
