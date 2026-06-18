"use client"

import { Printer } from "lucide-react"

export function DownloadButton({ token }: { token: string }) {
  return (
    <button
      onClick={() => window.open(`/sign/${token}/print`, "_blank")}
      className="inline-flex items-center gap-2 rounded-lg bg-[#512A83] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#6b3aab] transition-colors"
    >
      <Printer className="size-4" />
      Download / Print Delivery Note
    </button>
  )
}
