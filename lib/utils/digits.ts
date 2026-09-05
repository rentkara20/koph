// Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Eastern Arabic-Indic (۰۱۲۳۴۵۶۷۸۹) digits render
// as numbers to a reader but are different code points from ASCII 0-9. A mobile
// number stored as "٠٥٠٠..." cannot be dialled, matched against another record,
// or searched for, so every number entered anywhere is folded to ASCII before
// it is validated or saved.
//
// Note that JavaScript's \d and Number() do NOT accept these code points, so an
// unnormalised field silently fails validation instead of erroring loudly.

const ARABIC_INDIC_ZERO = 0x0660 // ٠
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0 // ۰

/** Folds Arabic-Indic and Eastern Arabic-Indic digits to ASCII, leaving the rest untouched. */
export function normalizeDigits(input: string): string {
  let out = ""
  for (const char of input) {
    const code = char.codePointAt(0)!
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO)
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO)
    } else {
      out += char
    }
  }
  return out
}

/** Normalises then keeps only ASCII digits — for fields that are purely numeric. */
export function digitsOnly(input: string): string {
  return normalizeDigits(input).replace(/\D/g, "")
}

/**
 * A phone number as entered: ASCII digits, with a single leading "+" kept so an
 * international number survives. Spaces, dashes and brackets are dropped.
 */
export function normalizeMobile(input: string): string {
  const normalized = normalizeDigits(input).trim()
  const plus = normalized.startsWith("+") ? "+" : ""
  return plus + normalized.replace(/\D/g, "")
}
