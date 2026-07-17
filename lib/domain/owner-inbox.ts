import type { InboxCard } from "@/lib/actions/inbox"

export type InboxUrgency = "urgent" | "high" | "normal"

const URGENCY_BY_WAITING_KEY: Record<string, InboxUrgency> = {
  overdueDelivery: "urgent",
  awaitingSignoff: "urgent",
  rentalEndingSoon: "urgent",
  awaitingApproval: "high",
  awaitingErpRef: "high",
  awaitingReceipt: "high",
  awaitingQc: "high",
}

const URGENCY_ORDER: Record<InboxUrgency, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
}

const PRIORITY_BY_WAITING_KEY: Record<string, number> = {
  overdueDelivery: 0,
  awaitingSignoff: 1,
  rentalEndingSoon: 1,
}

export type RankedInboxCard = {
  card: InboxCard
  urgency: InboxUrgency
}

export function rankOwnerInbox(cards: InboxCard[]): RankedInboxCard[] {
  return cards
    .map((card) => ({
      card,
      urgency: URGENCY_BY_WAITING_KEY[card.waitingKey] ?? "normal",
    }))
    .sort((a, b) => {
      const priorityDifference =
        (PRIORITY_BY_WAITING_KEY[a.card.waitingKey] ?? URGENCY_ORDER[a.urgency] + 2) -
        (PRIORITY_BY_WAITING_KEY[b.card.waitingKey] ?? URGENCY_ORDER[b.urgency] + 2)
      if (priorityDifference !== 0) return priorityDifference
      const urgencyDifference = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
      if (urgencyDifference !== 0) return urgencyDifference
      return (a.card.since ?? Number.POSITIVE_INFINITY) - (b.card.since ?? Number.POSITIVE_INFINITY)
    })
}
