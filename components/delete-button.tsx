"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { translateActionError } from "@/lib/i18n/action-errors"

interface DeleteButtonProps {
  onDelete: () => Promise<{ error?: string }>
  redirectTo?: string
  label?: string
}

export function DeleteButton({ onDelete, redirectTo, label = "Delete" }: DeleteButtonProps) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleDelete() {
    setLoading(true)
    setError("")
    try {
      const result = await onDelete()
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
        setLoading(false)
        setConfirming(false)
        return
      }
      toast.success(tToast("deleted"))
      if (redirectTo) {
        router.push(redirectTo)
      } else {
        router.refresh()
      }
    } catch {
      setError("An unexpected error occurred")
      toast.error(tToast("genericError"))
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <span className="text-sm text-muted-foreground">Are you sure?</span>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-4" />
      {label}
    </Button>
  )
}
