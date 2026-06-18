"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { updateTaskByToken } from "@/lib/actions/tasks"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const FAILURE_REASONS = [
  { value: "customer_unavailable", label: "Customer unavailable" },
  { value: "wrong_address", label: "Wrong address" },
  { value: "item_damaged", label: "Item damaged" },
  { value: "access_denied", label: "Access denied" },
  { value: "customer_rescheduled", label: "Customer rescheduled" },
  { value: "other", label: "Other" },
] as const

export function TaskActions({ token, status }: { token: string; status: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [showFailForm, setShowFailForm] = useState(false)
  const [failureReason, setFailureReason] = useState("")
  const [failureNotes, setFailureNotes] = useState("")
  const [error, setError] = useState("")

  async function act(action: "accept" | "reject" | "start" | "mark_done" | "mark_failed") {
    setError("")
    setLoading(action)
    try {
      const result = await updateTaskByToken(
        token,
        action,
        action === "mark_failed" ? { failureReason, failureNotes } : undefined
      )
      if (result.error) {
        setError(result.error)
        setLoading(null)
        return
      }
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* pending → accept / reject */}
      {status === "pending" && (
        <div className="flex gap-3">
          <Button
            className="flex-1 h-12 text-base"
            disabled={loading !== null}
            onClick={() => act("accept")}
          >
            {loading === "accept" && <Loader2 className="size-4 animate-spin mr-1" />}
            Accept task
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 text-base"
            disabled={loading !== null}
            onClick={() => act("reject")}
          >
            {loading === "reject" && <Loader2 className="size-4 animate-spin mr-1" />}
            Reject
          </Button>
        </div>
      )}

      {/* accepted → start */}
      {status === "accepted" && (
        <Button
          className="w-full h-12 text-base"
          disabled={loading !== null}
          onClick={() => act("start")}
        >
          {loading === "start" && <Loader2 className="size-4 animate-spin mr-1" />}
          Start task
        </Button>
      )}

      {/* in_progress → mark done / mark failed */}
      {status === "in_progress" && !showFailForm && (
        <div className="flex gap-3">
          <Button
            className="flex-1 h-12 text-base"
            disabled={loading !== null}
            onClick={() => act("mark_done")}
          >
            {loading === "mark_done" && <Loader2 className="size-4 animate-spin mr-1" />}
            Mark as done
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 text-base"
            disabled={loading !== null}
            onClick={() => setShowFailForm(true)}
          >
            Mark as failed
          </Button>
        </div>
      )}

      {/* Failure form */}
      {status === "in_progress" && showFailForm && (
        <div className="rounded-xl bg-background border p-4 space-y-4">
          <p className="font-medium text-sm">Mark task as failed</p>

          <div className="space-y-1.5">
            <Label htmlFor="failureReason" className="text-xs">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Select
              id="failureReason"
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              required
            >
              <option value="">— Select reason —</option>
              {FAILURE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="failureNotes" className="text-xs">
              Notes <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="failureNotes"
              rows={3}
              placeholder="Describe what happened…"
              value={failureNotes}
              onChange={(e) => setFailureNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="destructive"
              className="flex-1 h-12 text-base"
              disabled={!failureReason || loading !== null}
              onClick={() => act("mark_failed")}
            >
              {loading === "mark_failed" && <Loader2 className="size-4 animate-spin mr-1" />}
              Confirm failure
            </Button>
            <Button
              variant="outline"
              onClick={() => { setShowFailForm(false); setFailureReason(""); setFailureNotes("") }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
