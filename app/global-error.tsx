"use client"

import { useEffect } from "react"

// No i18n provider available here — this replaces the entire root layout
// when the layout itself throws, so it must stand alone with plain HTML.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "1.5rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong / حدث خطأ ما</h1>
          <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#666" }}>
            Please try again, or come back later. / يرجى إعادة المحاولة أو العودة لاحقاً.
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1.25rem", borderRadius: "0.375rem", border: "1px solid #ccc", cursor: "pointer" }}
          >
            Try again / إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  )
}
