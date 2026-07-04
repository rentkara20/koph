"use client"

import { useEffect } from "react"
import { Printer, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintActions() {
  useEffect(() => {
    // Auto-print when opened as a new tab from the sign page
    const timer = setTimeout(() => {
      if (document.referrer.includes("/sign/") || window.opener) {
        window.print()
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="print-actions-bar">
      <Button className="bg-kara-purple hover:bg-kara-purple/90" onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden />
        Print / Save as PDF
      </Button>
      <Button variant="secondary" onClick={() => window.close()}>
        <X className="size-4" aria-hidden />
        Close
      </Button>
    </div>
  )
}
