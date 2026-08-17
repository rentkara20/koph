// Single source of truth for the "what do I do next?" prompt on a request.
//
// Extracted from the detail-page banner so the requests LIST can show the same
// answer per row: the list previously showed only `status`, which says where a
// request is but never what the operator should do about it. Two derivations of
// the same prompt would drift, so both surfaces call this.

export type NextStepTone = "action" | "waiting" | "done" | "paused" | "cancelled"

export type NextStepInput = {
  status: string
  itemCount: number
  taskCount: number
  hasPendingSignoff: boolean
  hasSignedSignature: boolean
  hasAnySignature: boolean
}

export type NextStep = { key: string; tone: NextStepTone }

export function deriveNextStep(input: NextStepInput): NextStep {
  const { status, itemCount, taskCount, hasPendingSignoff, hasSignedSignature, hasAnySignature } =
    input

  if (status === "cancelled") return { key: "cancelled", tone: "cancelled" }
  if (status === "on_hold") return { key: "onHold", tone: "paused" }

  // A task waiting for sign-off is the most actionable thing regardless of request status
  if (hasPendingSignoff) return { key: "pendingSignoff", tone: "action" }

  if (status === "draft") {
    if (itemCount === 0) return { key: "draftNoItems", tone: "action" }
    if (taskCount === 0) return { key: "draftNoTasks", tone: "action" }
  }
  if (status === "assigned") return { key: "assigned", tone: "waiting" }
  if (status === "in_progress") return { key: "inProgress", tone: "waiting" }
  if (status === "completed") {
    if (!hasAnySignature) return { key: "needsSignature", tone: "action" }
    if (hasSignedSignature) return { key: "completed", tone: "done" }
    return { key: "needsSignature", tone: "action" }
  }
  return { key: "assigned", tone: "waiting" }
}
