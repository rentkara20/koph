import { describe, it, expect } from "vitest"
import {
  buildDedupeKey,
  nextRetryDelayMs,
  isDead,
  domainEventTypeForAssetAction,
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

  it("returns null for actions not yet wired to a domain event", () => {
    expect(domainEventTypeForAssetAction("reserve")).toBeNull()
    expect(domainEventTypeForAssetAction("unassign")).toBeNull()
    expect(domainEventTypeForAssetAction("mark_lost")).toBeNull()
    expect(domainEventTypeForAssetAction("sell")).toBeNull()
  })
})
