"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { deleteSignatureRequest } from "@/lib/actions/signatures"

export function SignatureDeleteButton({ id }: { id: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await deleteSignatureRequest(id)
    router.refresh()
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Delete?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-destructive hover:underline font-medium"
        >{loading ? "…" : "Yes"}</button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground"
        >No</button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
    >
      <Trash2 className="size-3" />
      Delete
    </button>
  )
}
