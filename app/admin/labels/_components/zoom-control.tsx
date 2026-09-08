"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Zoom control with a real "actual size" mode.
 *
 * A browser cannot know a monitor's physical pixel pitch, so 1:1 needs one
 * calibration per screen: the operator drags until the reference bar measures
 * 50 mm against a real ruler. The value is remembered per browser — without
 * it, "actual size" would be a guess presented as a fact.
 */

const CAL_KEY = "kara.label.pxPerMm"
const DEFAULT_PX_PER_MM = 96 / 25.4 // CSS-inch assumption, usually a few % off

export const ZOOM_PRESETS = [
  { label: "1:1 dots", value: 1 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
  { label: "4×", value: 4 },
]

export function useLabelZoom() {
  const [mode, setMode] = useState<"dots" | "actual">("dots")
  const [zoom, setZoom] = useState(2)
  const [pxPerMm, setPxPerMm] = useState(DEFAULT_PX_PER_MM)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CAL_KEY)
      if (saved) setPxPerMm(Number(saved) || DEFAULT_PX_PER_MM)
    } catch {
      // private mode / blocked storage — the default assumption still renders
    }
  }, [])

  function saveCalibration(v: number) {
    setPxPerMm(v)
    try {
      localStorage.setItem(CAL_KEY, String(v))
    } catch {
      // nothing to do: calibration just won't persist across reloads
    }
  }

  // 400 dots span 50 mm, so one dot is pxPerMm × 50 / 400 screen pixels.
  const effectiveZoom = mode === "actual" ? (pxPerMm * 50) / 400 : zoom

  return { mode, setMode, zoom, setZoom, pxPerMm, saveCalibration, effectiveZoom }
}

export function ZoomControl({
  state,
}: {
  state: ReturnType<typeof useLabelZoom>
}) {
  const { mode, setMode, zoom, setZoom, pxPerMm, saveCalibration } = state

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">العرض</Label>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === "actual" ? "default" : "outline"}
            onClick={() => setMode("actual")}
          >
            المقاس الحقيقي
          </Button>
          {ZOOM_PRESETS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={mode === "dots" && zoom === p.value ? "default" : "outline"}
              onClick={() => {
                setMode("dots")
                setZoom(p.value)
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">تكبير حر ({zoom.toFixed(1)}×)</Label>
        <input
          type="range"
          min={0.5}
          max={8}
          step={0.1}
          value={zoom}
          onChange={(e) => {
            setMode("dots")
            setZoom(Number(e.target.value))
          }}
          className="w-40"
        />
      </div>

      {mode === "actual" && (
        <div className="grid gap-1.5">
          <Label className="text-xs" htmlFor="cal">
            معايرة الشاشة — اضبط حتى يقيس الشريط ٥٠ مم بمسطرة حقيقية
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="cal"
              type="number"
              step="0.01"
              value={pxPerMm.toFixed(2)}
              onChange={(e) => saveCalibration(Number(e.target.value) || DEFAULT_PX_PER_MM)}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">px/mm</span>
            <div
              className="h-3 border-x-2 border-foreground bg-muted"
              style={{ width: pxPerMm * 50 }}
              title="يجب أن يساوي ٥٠ مم"
            />
          </div>
        </div>
      )}
    </div>
  )
}
