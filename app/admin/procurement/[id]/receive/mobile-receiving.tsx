"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowLeft, Camera, CheckCircle2, Keyboard, Loader2, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { receivePurchaseOrderLine } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"
import { deriveReceivingContinuation } from "@/lib/domain/receiving-continuation"
import { WorkflowContinuationCard } from "@/components/workflow-continuation-card"

type Line = {
  id: string
  description: string
  brand: string | null
  model: string | null
  ordered: number
  received: number
}

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

export function MobileReceiving({
  purchaseOrderId,
  poNumber,
  supplierName,
  qcRequired,
  linkedOrderNumber,
  pickupTaskId,
  initialLines,
}: {
  purchaseOrderId: string
  poNumber: string
  supplierName: string
  qcRequired: boolean
  linkedOrderNumber: string | null
  pickupTaskId?: string
  initialLines: Line[]
}) {
  const t = useTranslations("procurement.mobileReceiving")
  const tNext = useTranslations("workspace.nextActions")
  const [lines, setLines] = useState(initialLines)
  const [selectedLineId, setSelectedLineId] = useState(
    initialLines.find((line) => line.received < line.ordered)?.id ?? ""
  )
  const [serial, setSerial] = useState("")
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const submittingRef = useRef(false)

  const selectedLine = lines.find((line) => line.id === selectedLineId)
  const totalOrdered = lines.reduce((sum, line) => sum + line.ordered, 0)
  const totalReceived = lines.reduce((sum, line) => sum + line.received, 0)
  const hasRemaining = lines.some((line) => line.received < line.ordered)
  const continuation = deriveReceivingContinuation({
    purchaseOrderId,
    qcPending: qcRequired ? 1 : 0,
    qcFailed: 0,
    deliverableCount: qcRequired ? 0 : 1,
    linkedOrderNumber,
  })

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current)
    scanTimerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const receiveSerial = useCallback((rawSerial: string) => {
    const normalized = rawSerial.trim().toUpperCase()
    if (!normalized || !selectedLineId || submittingRef.current) return
    submittingRef.current = true
    setSerial(normalized)
    setStatus(null)
    startTransition(async () => {
      const result = await receivePurchaseOrderLine({
        purchaseOrderLineId: selectedLineId,
        serialNumber: normalized,
        pickupTaskId,
      })
      if (result.error) {
        setStatus({ kind: "error", text: translateActionError(result.error) })
        submittingRef.current = false
        return
      }
      setLines((current) => {
        const updated = current.map((line) =>
          line.id === selectedLineId ? { ...line, received: Math.min(line.ordered, line.received + 1) } : line
        )
        const currentLine = updated.find((line) => line.id === selectedLineId)
        if (currentLine && currentLine.received >= currentLine.ordered) {
          setSelectedLineId(updated.find((line) => line.received < line.ordered)?.id ?? "")
        }
        return updated
      })
      setStatus({ kind: "success", text: t("saved", { serial: normalized }) })
      setSerial("")
      submittingRef.current = false
    })
  }, [pickupTaskId, selectedLineId, t])

  async function startCamera() {
    setCameraError(null)
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    if (!Detector) {
      setCameraError(t("cameraUnsupported"))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = stream
      setScanning(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
      const detector = new Detector({ formats: ["code_128", "code_39", "qr_code", "data_matrix"] })
      const detect = async () => {
        if (!videoRef.current || !streamRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          const value = codes[0]?.rawValue?.trim()
          if (value) {
            stopCamera()
            receiveSerial(value)
            return
          }
        } catch {
          // A frame can fail while the camera is focusing; keep scanning.
        }
        scanTimerRef.current = window.setTimeout(detect, 250)
      }
      scanTimerRef.current = window.setTimeout(detect, 400)
    } catch {
      stopCamera()
      setCameraError(t("cameraDenied"))
    }
  }

  return (
    <div className="mx-auto min-h-[calc(100dvh-7rem)] max-w-xl space-y-5 pb-28">
      <header className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2"
            render={<Link href={`/admin/procurement/${purchaseOrderId}`} />}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
            <span className="hidden sm:inline">{t("backToPo")}</span>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{t("title")}</h1>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">{poNumber} · {supplierName}</p>
          </div>
          <div className="text-end">
            <p className="text-xl font-bold tabular-nums">{totalReceived}/{totalOrdered}</p>
            <p className="text-[10px] text-muted-foreground">{t("received")}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${totalOrdered ? (totalReceived / totalOrdered) * 100 : 100}%` }} />
        </div>
      </header>

      {!hasRemaining ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <CheckCircle2 className="mx-auto size-10 text-green-600" />
            <p className="mt-3 font-medium">{t("complete")}</p>
          </div>
          <WorkflowContinuationCard
            title={t("nextStep")}
            description={t(`${continuation.key}Hint`)}
            actionLabel={tNext(continuation.key)}
            href={continuation.href}
          />
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t("chooseItem")}</h2>
            {lines.map((line) => {
              const active = line.id === selectedLineId
              const remaining = line.ordered - line.received
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => setSelectedLineId(line.id)}
                  disabled={remaining === 0 || pending}
                  className={`w-full rounded-xl border p-4 text-start transition-colors ${active ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "bg-card"} disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{line.description}</p>
                      <p className="truncate text-xs text-muted-foreground">{[line.brand, line.model].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="font-semibold tabular-nums">{line.received}/{line.ordered}</p>
                      <p className="text-xs text-muted-foreground">{t("remaining", { count: remaining })}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </section>

          {scanning && (
            <section className="overflow-hidden rounded-2xl border bg-black">
              <div className="relative aspect-[4/3]">
                <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" />
                <Button variant="secondary" size="icon" className="absolute end-3 top-3" onClick={stopCamera}>
                  <X className="size-5" />
                </Button>
              </div>
              <p className="p-3 text-center text-sm text-white">{t("pointCamera")}</p>
            </section>
          )}

          {cameraError && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{cameraError}</p>}
          {status && (
            <div className={`rounded-xl p-3 text-sm font-medium ${status.kind === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {status.text}
            </div>
          )}

          <section className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Keyboard className="size-4" />
              {t("manualEntry")}
            </div>
            <Input
              value={serial}
              onChange={(event) => setSerial(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") receiveSerial(serial)
              }}
              placeholder={t("serialPlaceholder")}
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              dir="ltr"
              className="h-12 text-base"
              disabled={pending || !selectedLine}
            />
            <Button className="h-12 w-full text-base" onClick={() => receiveSerial(serial)} disabled={pending || !serial.trim() || !selectedLine}>
              {pending ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
              {pending ? t("saving") : t("saveDevice")}
            </Button>
          </section>
        </>
      )}

      {hasRemaining && (
        <div className="fixed inset-x-0 bottom-0 z-20 space-y-2 border-t bg-background/95 p-3 backdrop-blur sm:static sm:rounded-xl sm:border">
          <Button className="h-12 w-full text-base" onClick={scanning ? stopCamera : startCamera} disabled={pending || !selectedLine}>
            {scanning ? <X className="size-5" /> : cameraError ? <RefreshCw className="size-5" /> : <Camera className="size-5" />}
            {scanning ? t("stopCamera") : t("scanCamera")}
          </Button>
          {/* Explicit exit for a partial receipt (shipment split, shift ended) —
              the operator isn't forced to scan every remaining unit right now. */}
          <Button
            variant="outline"
            className="h-11 w-full text-sm"
            render={<Link href={`/admin/procurement/${purchaseOrderId}`} />}
          >
            {t("finishReceiving")}
          </Button>
        </div>
      )}
    </div>
  )
}
