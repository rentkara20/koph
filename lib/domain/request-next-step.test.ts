// The requests LIST and the request DETAIL banner both render this prompt. They
// used to be one hard-coded copy on the detail page; these tests pin the
// precedence rules so the shared version cannot quietly change what either
// surface tells the operator to do.
import { describe, expect, test } from "vitest"
import { deriveNextStep, type NextStepInput } from "./request-next-step"

const base: NextStepInput = {
  status: "draft",
  itemCount: 0,
  taskCount: 0,
  hasPendingSignoff: false,
  hasSignedSignature: false,
  hasAnySignature: false,
}

describe("deriveNextStep", () => {
  test("terminal statuses short-circuit before anything else", () => {
    expect(deriveNextStep({ ...base, status: "cancelled" })).toEqual({
      key: "cancelled",
      tone: "cancelled",
    })
    expect(deriveNextStep({ ...base, status: "on_hold" })).toEqual({
      key: "onHold",
      tone: "paused",
    })
  })

  test("a task awaiting sign-off outranks the request's own status", () => {
    for (const status of ["draft", "assigned", "in_progress", "completed"]) {
      expect(deriveNextStep({ ...base, status, hasPendingSignoff: true })).toEqual({
        key: "pendingSignoff",
        tone: "action",
      })
    }
  })

  test("cancelled and on_hold still win over a pending sign-off", () => {
    expect(deriveNextStep({ ...base, status: "cancelled", hasPendingSignoff: true }).key).toBe(
      "cancelled"
    )
    expect(deriveNextStep({ ...base, status: "on_hold", hasPendingSignoff: true }).key).toBe(
      "onHold"
    )
  })

  test("a draft asks for items first, then for a partner", () => {
    expect(deriveNextStep({ ...base, itemCount: 0 }).key).toBe("draftNoItems")
    expect(deriveNextStep({ ...base, itemCount: 2, taskCount: 0 }).key).toBe("draftNoTasks")
  })

  test("a draft that already has items and a task falls through to waiting", () => {
    expect(deriveNextStep({ ...base, itemCount: 2, taskCount: 1 })).toEqual({
      key: "assigned",
      tone: "waiting",
    })
  })

  test("completed work is only done once a signature is signed", () => {
    const completed = { ...base, status: "completed", itemCount: 1, taskCount: 1 }
    expect(deriveNextStep(completed).key).toBe("needsSignature")
    expect(deriveNextStep({ ...completed, hasAnySignature: true }).key).toBe("needsSignature")
    expect(
      deriveNextStep({ ...completed, hasAnySignature: true, hasSignedSignature: true })
    ).toEqual({ key: "completed", tone: "done" })
  })

  test("an unrecognised status degrades to waiting rather than throwing", () => {
    expect(deriveNextStep({ ...base, status: "rescheduled" })).toEqual({
      key: "assigned",
      tone: "waiting",
    })
  })

  // Only "action" and "paused" get emphasis in the list; if a new tone appears
  // without a style entry the row would render unstyled, so keep the set closed.
  test("every returned tone is one of the five known tones", () => {
    const tones = new Set(["action", "waiting", "done", "paused", "cancelled"])
    const statuses = [
      "draft",
      "assigned",
      "in_progress",
      "completed",
      "failed",
      "on_hold",
      "cancelled",
      "rescheduled",
    ]
    for (const status of statuses) {
      for (const hasPendingSignoff of [true, false]) {
        for (const hasAnySignature of [true, false]) {
          const step = deriveNextStep({ ...base, status, hasPendingSignoff, hasAnySignature })
          expect(tones.has(step.tone)).toBe(true)
        }
      }
    }
  })
})
