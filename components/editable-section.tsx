"use client"

import { cloneElement, isValidElement, useState, type ReactElement } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EditFormProps {
  onCancel?: () => void
  onSaved?: () => void
}

interface EditableSectionProps {
  view: React.ReactNode
  edit: ReactElement<EditFormProps>
  editLabel: string
}

/**
 * Locks a detail form behind a read-only view by default — the info form
 * used to render always-open, so anyone glancing at the page could nudge a
 * field by mistake. "Edit" swaps in the real form; success/cancel swap back.
 *
 * `edit` is passed as a plain element (built in the parent Server Component)
 * rather than a render-prop function — functions can't cross the Server/Client
 * boundary. The close callback is injected client-side via cloneElement instead.
 */
export function EditableSection({ view, edit, editLabel }: EditableSectionProps) {
  const [editing, setEditing] = useState(false)
  const close = () => setEditing(false)

  if (editing) {
    return isValidElement(edit) ? cloneElement(edit, { onCancel: close, onSaved: close }) : edit
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
          {editLabel}
        </Button>
      </div>
      {view}
    </div>
  )
}
