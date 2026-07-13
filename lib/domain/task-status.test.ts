import { describe, it, expect } from "vitest"
import { canTransition, ACTION_STATUS } from "./task-status"

describe("canTransition", () => {
  it("allows pending → accept/reject", () => {
    expect(canTransition("pending", "accept")).toBe(true)
    expect(canTransition("pending", "reject")).toBe(true)
  })
  it("blocks pending → start/mark_done/mark_failed", () => {
    expect(canTransition("pending", "start")).toBe(false)
    expect(canTransition("pending", "mark_done")).toBe(false)
    expect(canTransition("pending", "mark_failed")).toBe(false)
  })
  it("allows accepted → start only", () => {
    expect(canTransition("accepted", "start")).toBe(true)
    expect(canTransition("accepted", "accept")).toBe(false)
    expect(canTransition("accepted", "mark_done")).toBe(false)
  })
  it("allows in_progress → mark_done/mark_failed only", () => {
    expect(canTransition("in_progress", "mark_done")).toBe(true)
    expect(canTransition("in_progress", "mark_failed")).toBe(true)
    expect(canTransition("in_progress", "start")).toBe(false)
    expect(canTransition("in_progress", "accept")).toBe(false)
  })
  it("blocks any transition from terminal states", () => {
    for (const s of ["closed", "rejected", "failed", "cancelled", "pending_signoff"]) {
      expect(canTransition(s, "start")).toBe(false)
      expect(canTransition(s, "mark_done")).toBe(false)
    }
  })
})

describe("canTransition — supplier_pickup kind", () => {
  it("follows pending → accepted → arrived → picked_up", () => {
    expect(canTransition("pending", "accept", "supplier_pickup")).toBe(true)
    expect(canTransition("pending", "reject", "supplier_pickup")).toBe(true)
    expect(canTransition("accepted", "mark_arrived", "supplier_pickup")).toBe(true)
    expect(canTransition("arrived", "mark_picked_up", "supplier_pickup")).toBe(true)
  })
  it("partner can never complete a pickup (no mark_done, no exit from picked_up)", () => {
    expect(canTransition("accepted", "mark_done", "supplier_pickup")).toBe(false)
    expect(canTransition("arrived", "mark_done", "supplier_pickup")).toBe(false)
    expect(canTransition("picked_up", "mark_done", "supplier_pickup")).toBe(false)
    expect(canTransition("picked_up", "mark_failed", "supplier_pickup")).toBe(false)
    expect(canTransition("picked_up", "mark_picked_up", "supplier_pickup")).toBe(false)
  })
  it("allows failure only before goods are collected", () => {
    expect(canTransition("accepted", "mark_failed", "supplier_pickup")).toBe(true)
    expect(canTransition("arrived", "mark_failed", "supplier_pickup")).toBe(true)
  })
  it("pickup statuses are not reachable for request kind", () => {
    expect(canTransition("accepted", "mark_arrived")).toBe(false)
    expect(canTransition("arrived", "mark_picked_up", "request")).toBe(false)
    expect(canTransition("accepted", "start", "supplier_pickup")).toBe(false)
  })
})

describe("ACTION_STATUS", () => {
  it("maps each action to its target status", () => {
    expect(ACTION_STATUS.accept).toBe("accepted")
    expect(ACTION_STATUS.reject).toBe("rejected")
    expect(ACTION_STATUS.start).toBe("in_progress")
    expect(ACTION_STATUS.mark_done).toBe("pending_signoff")
    expect(ACTION_STATUS.mark_failed).toBe("failed")
  })
})
