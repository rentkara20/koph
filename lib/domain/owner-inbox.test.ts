import { describe, expect, test } from "vitest"
import { rankOwnerInbox } from "./owner-inbox"
import type { InboxCard } from "@/lib/actions/inbox"

function card(key: string, waitingKey: string, since: number | null): InboxCard {
  return {
    key,
    waitingKey,
    since,
    owner: "operations",
    actionKey: "openRequest",
    href: "/",
    requestRef: key,
    customerName: null,
  }
}

describe("rankOwnerInbox", () => {
  test("puts overdue and sign-off decisions before routine work", () => {
    const ranked = rankOwnerInbox([
      card("quote", "awaitingQuotes", 100),
      card("overdue", "overdueDelivery", 300),
      card("signoff", "awaitingSignoff", 200),
    ])

    expect(ranked.map((item) => item.card.key)).toEqual(["overdue", "signoff", "quote"])
    expect(ranked.map((item) => item.urgency)).toEqual(["urgent", "urgent", "normal"])
  })

  test("orders equal-priority work oldest first and leaves unknown work visible", () => {
    const ranked = rankOwnerInbox([
      card("new", "awaitingReceipt", 300),
      card("unknown", "futureAction", null),
      card("old", "awaitingReceipt", 100),
    ])

    expect(ranked.map((item) => item.card.key)).toEqual(["old", "new", "unknown"])
    expect(ranked.at(-1)?.urgency).toBe("normal")
  })
})
