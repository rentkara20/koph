"use client"

import { useEffect } from "react"

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
      <button
        onClick={() => window.print()}
        style={{
          background: "#512A83",
          color: "#fff",
          border: "none",
          padding: "9px 20px",
          borderRadius: 6,
          fontSize: 13,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        🖨️ Print / Save as PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{
          background: "#e5e7eb",
          color: "#333",
          border: "none",
          padding: "9px 16px",
          borderRadius: 6,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  )
}
