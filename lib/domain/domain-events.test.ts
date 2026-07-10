import { describe, it, expect } from "vitest"
import {
  buildDedupeKey,
  nextRetryDelayMs,
  isDead,
  domainEventTypeForAssetAction,
  domainEventTypeForTaskAction,
  MAX_DELIVERY_ATTEMPTS,
} from "./domain-events"

describe("buildDedupeKey", () => {
  it("joins aggregate type, id, and event type", () => {
    expect(buildDedupeKey("asset", "a1", "AssetDelivered")).toBe("asset:a1:AssetDelivered")
  })

  it("appends an optional suffix for per-occurrence uniqueness", () => {
    expect(buildDedupeKey("asset", "a1", "AssetDelivered", "evt123")).toBe("asset:a1:AssetDelivered:evt123")
  })
})

describe("nextRetryDelayMs", () => {
  it("returns increasing delays as attempts increase", () => {
    const d0 = nextRetryDelayMs(0)
    const d1 = nextRetryDelayMs(1)
    const d2 = nextRetryDelayMs(2)
    expect(d1).toBeGreaterThan(d0)
    expect(d2).toBeGreaterThan(d1)
  })

  it("caps out at the last schedule entry for very high attempt counts", () => {
    const capped = nextRetryDelayMs(100)
    expect(nextRetryDelayMs(5)).toBe(capped)
  })

  it("never returns a delay for a negative attempt below the first entry", () => {
    expect(nextRetryDelayMs(-1)).toBe(nextRetryDelayMs(0))
  })
})

describe("isDead", () => {
  it("is false below the max attempt count", () => {
    expect(isDead(MAX_DELIVERY_ATTEMPTS - 1)).toBe(false)
  })

  it("is true at or above the max attempt count", () => {
    expect(isDead(MAX_DELIVERY_ATTEMPTS)).toBe(true)
    expect(isDead(MAX_DELIVERY_ATTEMPTS + 1)).toBe(true)
  })
})

describe("domainEventTypeForAssetAction", () => {
  it("maps wired asset actions to their domain event type", () => {
    expect(domainEventTypeForAssetAction("assign")).toBe("AssetAssigned")
    expect(domainEventTypeForAssetAction("deliver")).toBe("AssetDelivered")
    expect(domainEventTypeForAssetAction("return")).toBe("AssetReturned")
    expect(domainEventTypeForAssetAction("send_maintenance")).toBe("AssetMaintenanceOpened")
    expect(domainEventTypeForAssetAction("repair_done")).toBe("AssetMaintenanceClosed")
    expect(domainEventTypeForAssetAction("retire")).toBe("AssetRetired")
  })

  it("maps every remaining asset action (OI-2 coverage closure)", () => {
    expect(domainEventTypeForAssetAction("reserve")).toBe("AssetReserved")
    expect(domainEventTypeForAssetAction("unreserve")).toBe("AssetUnreserved")
    expect(domainEventTypeForAssetAction("unassign")).toBe("AssetUnassigned")
    expect(domainEventTypeForAssetAction("restock")).toBe("AssetRestocked")
    expect(domainEventTypeForAssetAction("mark_damaged")).toBe("AssetDamaged")
    expect(domainEventTypeForAssetAction("mark_lost")).toBe("AssetLost")
    expect(domainEventTypeForAssetAction("found")).toBe("AssetFound")
    expect(domainEventTypeForAssetAction("sell")).toBe("AssetSold")
  })

  it("returns null for an action string outside the known AssetAction set", () => {
    expect(domainEventTypeForAssetAction("not_a_real_action")).toBeNull()
  })
})

describe("domainEventTypeForTaskAction", () => {
  it("maps every partner task action to its domain event type", () => {
    expect(domainEventTypeForTaskAction("accept")).toBe("TaskAccepted")
    expect(domainEventTypeForTaskAction("start")).toBe("TaskStarted")
    expect(domainEventTypeForTaskAction("mark_done")).toBe("TaskPendingSignoff")
    expect(domainEventTypeForTaskAction("reject")).toBe("TaskRejected")
    expect(domainEventTypeForTaskAction("mark_failed")).toBe("TaskFailed")
  })

  it("returns null for an action string outside the known PartnerAction set", () => {
    expect(domainEventTypeForTaskAction("not_a_real_action")).toBeNull()
  })
})
