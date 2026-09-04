// Best-effort geolocation for the signing act, client side.
//
// Two hard rules:
//   1. It never blocks a signature. Every failure path — denial, no fix, no
//      API, timeout — resolves, never rejects, and never throws.
//   2. It is never silent. When there are no coordinates the reason is
//      recorded, so "the signer declined" is distinguishable from "we never
//      asked" months later when someone disputes a delivery.
import type { GeoUnavailableReason, SigningGeo } from "@/lib/domain/signature-channel"

const TIMEOUT_MS = 8000

export function captureSigningGeo(): Promise<SigningGeo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ unavailableReason: "unsupported" })
  }

  return new Promise<SigningGeo>((resolve) => {
    // Guard against a browser that neither resolves nor errors (seen on some
    // in-app webviews): resolve ourselves so the signature can proceed.
    let settled = false
    const finish = (value: SigningGeo) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const guard = setTimeout(() => finish({ unavailableReason: "timeout" }), TIMEOUT_MS + 2000)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(guard)
        finish({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        })
      },
      (error) => {
        clearTimeout(guard)
        finish({ unavailableReason: mapError(error) })
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 60_000 }
    )
  })
}

function mapError(error: GeolocationPositionError): GeoUnavailableReason {
  switch (error?.code) {
    case 1:
      return "denied"
    case 2:
      return "unavailable"
    case 3:
      return "timeout"
    default:
      return "error"
  }
}
