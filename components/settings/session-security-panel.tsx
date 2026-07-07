"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { revokeAllOtherSessions } from "@/lib/actions/session-security"
import { Button } from "@/components/ui/button"

export function SessionSecurityPanel({ activeSessionCount }: { activeSessionCount: number }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleRevoke() {
    setLoading(true)
    try {
      const result = await revokeAllOtherSessions()
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Signed out ${result.revoked ?? 0} other session(s).`)
        router.refresh()
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {activeSessionCount} active session{activeSessionCount !== 1 ? "s" : ""} across all users.
      </p>
      {!confirming ? (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Sign out all other sessions
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            This signs out every user except you. Continue?
          </span>
          <Button variant="destructive" size="sm" onClick={handleRevoke} disabled={loading}>
            {loading ? "Signing out…" : "Confirm"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={loading}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
