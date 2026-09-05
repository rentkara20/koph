/**
 * Signature-document names are STORED in English by buildDeliveryNoteName and
 * frozen into the signed snapshot — they are part of the evidence and must not
 * be rewritten after the fact. So the Arabic reader is served at RENDER time:
 * the leading kind phrase is peeled off and re-labelled from the message
 * catalogue, leaving the identifying tail ("#10697 TAM, RUH, P1") untouched.
 *
 * Doing it here rather than at write time also covers every historical row
 * without a data migration.
 */

/** Kind phrases buildDeliveryNoteName can emit, longest-first for matching. */
const DOCUMENT_KINDS = [
  { key: "collectionReceipt", prefix: "Collection Receipt" },
  { key: "deliveryNote", prefix: "Delivery Note" },
] as const

export type DocumentNameKind = (typeof DOCUMENT_KINDS)[number]["key"]

/**
 * Splits a stored document name into its translatable kind and the rest.
 * Returns kind = null for names that were typed by hand and follow no pattern —
 * those are shown verbatim rather than guessed at.
 */
export function splitDocumentName(name?: string | null): {
  kind: DocumentNameKind | null
  rest: string
} {
  const raw = (name ?? "").trim()
  for (const { key, prefix } of DOCUMENT_KINDS) {
    if (raw.startsWith(prefix)) {
      return { kind: key, rest: raw.slice(prefix.length).trim() }
    }
  }
  return { kind: null, rest: raw }
}

/**
 * Renders a stored document name in the reader's language.
 * `translateKind` maps a DocumentNameKind to its localised phrase (typically
 * `t` bound to the `signatures.documentKind` namespace).
 */
export function localizeDocumentName(
  name: string | null | undefined,
  translateKind: (kind: DocumentNameKind) => string
): string {
  const { kind, rest } = splitDocumentName(name)
  if (!kind) return rest
  const label = translateKind(kind)
  return rest ? `${label} ${rest}` : label
}
