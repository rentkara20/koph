"use client"

// Minimal dependency-free slide-in panel (no radix-ui/react-dialog in this
// project yet). Covers what the admin mobile drawer needs: backdrop, Escape
// to close, focus-visible close button, body scroll lock.

import { useEffect, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SheetProps {
  open: boolean
  onClose: () => void
  side?: "start" | "end"
  children: React.ReactNode
  title?: string
  panelClassName?: string
}

export function Sheet({ open, onClose, side = "start", children, title, panelClassName }: SheetProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!mounted || !open || typeof document === "undefined") return null

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity",
        "pointer-events-auto opacity-100"
      )}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute top-0 h-full w-72 max-w-[85vw] bg-sidebar shadow-xl transition-transform duration-200 ease-out",
          panelClassName,
          side === "start" ? "start-0" : "end-0",
          "translate-x-0"
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="absolute top-3 end-3 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>,
    document.body
  )
}
