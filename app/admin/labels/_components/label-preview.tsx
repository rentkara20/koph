"use client"

import { useEffect, useRef, useState } from "react"
import { drawLabel, loadLogo, type LabelData } from "@/lib/labels/render"
import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_PROFILE_ID,
  getProfile,
  labelDots,
  type LabelSizeMm,
} from "@/lib/domain/printer-profiles"

/**
 * One label, rendered at printer resolution and displayed at `zoom`.
 *
 * The canvas is always 400×200 device pixels (1 px = 1 printer dot); zoom only
 * scales the CSS box, so what is displayed is a magnified view of the exact
 * bitmap that will be sent to the printer — never a re-drawn approximation.
 */
export function LabelPreview({
  data,
  zoom,
  profileId = DEFAULT_PROFILE_ID,
  size = DEFAULT_LABEL_SIZE,
  onCanvas,
}: {
  data: LabelData
  zoom: number
  profileId?: string
  size?: LabelSizeMm
  onCanvas?: (serial: string, canvas: HTMLCanvasElement) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    loadLogo()
      .then((logo) => {
        if (cancelled || !ref.current) return
        drawLabel(ref.current, data, logo, profileId, size)
        onCanvas?.(data.serialNumber, ref.current)
      })
      .catch(() => !cancelled && setError("logo"))
    return () => {
      cancelled = true
    }
    // onCanvas is a stable callback from the parent; re-running on identity
    // changes would redraw every label on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.serialNumber, data.url, profileId, size.widthMm, size.heightMm])

  if (error) {
    return (
      <div className="grid h-24 place-items-center rounded border border-dashed text-xs text-muted-foreground">
        logo failed to load
      </div>
    )
  }

  const dots = labelDots(getProfile(profileId), size)
  const scale = zoom

  return (
    <canvas
      ref={ref}
      className="block rounded-sm border bg-white shadow-sm"
      style={{
        width: dots.width * scale,
        height: dots.height * scale,
        imageRendering: "pixelated",
      }}
    />
  )
}
