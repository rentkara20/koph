// Pure, framework-free helpers backing the async SearchableSelect. Kept out of
// the component so the tricky bits — stale-response ordering and keyboard
// active-index math — are deterministically unit-testable without a DOM.

/**
 * Monotonic request guard. Each search issues a token; only results whose token
 * is still the latest may be applied. Prevents a slow earlier request from
 * overwriting a newer one's results (last-issued wins).
 */
export function createStaleGuard() {
  let latest = 0
  return {
    /** Start a new request; returns its token. */
    issue(): number {
      latest += 1
      return latest
    },
    /** Whether `token` is still the most recently issued request. */
    isCurrent(token: number): boolean {
      return token === latest
    },
  }
}

export type StaleGuard = ReturnType<typeof createStaleGuard>

/**
 * Next highlighted option index for an ArrowUp/ArrowDown press, wrapping at the
 * ends. Returns -1 for an empty list (nothing to highlight).
 */
export function moveActiveIndex(
  current: number,
  key: "ArrowDown" | "ArrowUp",
  count: number
): number {
  if (count <= 0) return -1
  if (key === "ArrowDown") return current < count - 1 ? current + 1 : 0
  return current > 0 ? current - 1 : count - 1
}
