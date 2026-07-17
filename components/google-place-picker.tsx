"use client"

import { useEffect, useRef, useState } from "react"
import { Crosshair, ExternalLink, MapPin, Search } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type PlaceSelection = {
  address: string
  city: string
  mapsLink: string
  googlePlaceId: string
  latitude: number | null
  longitude: number | null
}

type GooglePlace = {
  id?: string
  formattedAddress?: string
  addressComponents?: Array<{ longText?: string; types?: string[] }>
  location?: { lat(): number; lng(): number }
  fetchFields(options: { fields: string[] }): Promise<void>
}

type PlaceSelectEvent = Event & {
  placePrediction?: { toPlace(): GooglePlace }
}

type GoogleMapsApi = {
  maps: {
    importLibrary(name: "places"): Promise<{
      PlaceAutocompleteElement: new (options?: Record<string, unknown>) => HTMLElement
    }>
  }
}

declare global {
  interface Window {
    google?: GoogleMapsApi
  }
}

let loader: Promise<GoogleMapsApi> | null = null

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google) return Promise.resolve(window.google)
  if (loader) return loader

  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-koph-google-maps="true"]')
    const script = existing ?? document.createElement("script")
    const finish = () => window.google ? resolve(window.google) : reject(new Error("Google Maps did not load"))
    script.addEventListener("load", finish, { once: true })
    script.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true })
    if (!existing) {
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`
      script.async = true
      script.dataset.kophGoogleMaps = "true"
      document.head.appendChild(script)
    }
  })
  return loader
}

function mapsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
}

function cityFrom(place: GooglePlace) {
  const cityTypes = ["locality", "administrative_area_level_2", "administrative_area_level_1"]
  return place.addressComponents?.find((part) => part.types?.some((type) => cityTypes.includes(type)))?.longText ?? ""
}

export function GooglePlacePicker({
  value,
  onChange,
  labels,
}: {
  value: PlaceSelection
  onChange: (selection: PlaceSelection) => void
  labels: {
    title: string
    hint: string
    unavailable: string
    currentLocation: string
    openMap: string
  }
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [locating, setLocating] = useState(false)
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!apiKey || !hostRef.current) return
    let disposed = false
    let autocomplete: HTMLElement | null = null

    loadGoogleMaps(apiKey)
      .then((google) => google.maps.importLibrary("places"))
      .then(({ PlaceAutocompleteElement }) => {
        if (disposed || !hostRef.current) return
        autocomplete = new PlaceAutocompleteElement({ includedRegionCodes: ["sa"] })
        autocomplete.setAttribute("placeholder", labels.title)
        autocomplete.className = "block min-h-11 w-full"
        autocomplete.addEventListener("gmp-select", async (rawEvent) => {
          const event = rawEvent as PlaceSelectEvent
          const place = event.placePrediction?.toPlace()
          if (!place) return
          await place.fetchFields({
            fields: ["id", "formattedAddress", "location", "addressComponents"],
          })
          const latitude = place.location?.lat() ?? null
          const longitude = place.location?.lng() ?? null
          onChange({
            address: place.formattedAddress ?? "",
            city: cityFrom(place),
            googlePlaceId: place.id ?? "",
            latitude,
            longitude,
            mapsLink: latitude !== null && longitude !== null
              ? mapsLink(latitude, longitude)
              : "",
          })
        })
        hostRef.current.replaceChildren(autocomplete)
        setReady(true)
      })
      .catch(() => setReady(false))

    return () => {
      disposed = true
      autocomplete?.remove()
    }
  }, [apiKey, labels.title, onChange])

  function useCurrentLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({
          ...value,
          latitude: coords.latitude,
          longitude: coords.longitude,
          mapsLink: mapsLink(coords.latitude, coords.longitude),
        })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const hasCoordinates = value.latitude !== null && value.longitude !== null

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Search className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">{labels.title}</p>
          <p className="text-xs text-muted-foreground text-pretty">{labels.hint}</p>
        </div>
      </div>

      <div ref={hostRef} className={apiKey ? "min-h-11" : "hidden"} />
      {!apiKey && <p className="text-xs text-muted-foreground">{labels.unavailable}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={useCurrentLocation} disabled={locating}>
          <Crosshair className="size-4" />
          {labels.currentLocation}
        </Button>
        {value.mapsLink && (
          <a
            href={value.mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-10")}
          >
            <ExternalLink className="size-4" />
            {labels.openMap}
          </a>
        )}
      </div>

      {hasCoordinates && (
        <div className="overflow-hidden rounded-lg border bg-background">
          <iframe
            title={labels.title}
            src={`https://www.google.com/maps?q=${value.latitude},${value.longitude}&z=17&output=embed`}
            className="h-44 w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <p className="flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            <MapPin className="size-3.5" />
            {value.latitude?.toFixed(6)}, {value.longitude?.toFixed(6)}
          </p>
        </div>
      )}
      {apiKey && !ready && <span className="sr-only">Loading Google Maps</span>}
    </div>
  )
}
