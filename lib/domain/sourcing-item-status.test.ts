import { describe, expect, test } from "vitest"
import {
  canIncludeItemInRfq,
  itemStatusAfterRfq,
  type SourcingItemStatus,
} from "./sourcing-item-status"

describe("canIncludeItemInRfq", () => {
  test("allows all non-terminal statuses (re-quoting is a revision flow)", () => {
    const allowed: SourcingItemStatus[] = ["pending", "rfq_sent", "quoted", "selected"]
    for (const status of allowed) {
      expect(canIncludeItemInRfq(status)).toBe(true)
    }
  })

  test("blocks terminal statuses", () => {
    expect(canIncludeItemInRfq("cancelled")).toBe(false)
    expect(canIncludeItemInRfq("not_sourced")).toBe(false)
  })
})

describe("itemStatusAfterRfq", () => {
  test("advances pending to rfq_sent", () => {
    expect(itemStatusAfterRfq("pending")).toBe("rfq_sent")
  })

  test("never regresses items already further along", () => {
    const unchanged: SourcingItemStatus[] = ["rfq_sent", "quoted", "selected"]
    for (const status of unchanged) {
      expect(itemStatusAfterRfq(status)).toBe(status)
    }
  })
})
