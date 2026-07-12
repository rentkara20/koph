import { describe, expect, test } from "vitest"
import { createStaleGuard, moveActiveIndex } from "./async-search"

describe("createStaleGuard", () => {
  test("only the most recently issued token is current", () => {
    const guard = createStaleGuard()
    const first = guard.issue()
    const second = guard.issue()
    // A slow earlier response must not win over a newer one.
    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
  })

  test("re-issuing invalidates the previous token (rapid searches)", () => {
    const guard = createStaleGuard()
    const a = guard.issue()
    expect(guard.isCurrent(a)).toBe(true)
    const b = guard.issue()
    expect(guard.isCurrent(a)).toBe(false)
    expect(guard.isCurrent(b)).toBe(true)
  })
})

describe("moveActiveIndex", () => {
  test("ArrowDown advances and wraps to the top", () => {
    expect(moveActiveIndex(-1, "ArrowDown", 3)).toBe(0)
    expect(moveActiveIndex(0, "ArrowDown", 3)).toBe(1)
    expect(moveActiveIndex(2, "ArrowDown", 3)).toBe(0)
  })

  test("ArrowUp retreats and wraps to the bottom", () => {
    expect(moveActiveIndex(1, "ArrowUp", 3)).toBe(0)
    expect(moveActiveIndex(0, "ArrowUp", 3)).toBe(2)
    expect(moveActiveIndex(-1, "ArrowUp", 3)).toBe(2)
  })

  test("empty list has no active index", () => {
    expect(moveActiveIndex(-1, "ArrowDown", 0)).toBe(-1)
    expect(moveActiveIndex(0, "ArrowUp", 0)).toBe(-1)
  })
})
