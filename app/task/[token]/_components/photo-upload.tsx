"use client"

import { useState, useRef } from "react"
import { useTranslations } from "next-intl"
import { upload } from "@vercel/blob/client"
import { Camera, X, Loader2 } from "lucide-react"
import Image from "next/image"

type Photo = {
  id: string
  fileUrl: string
  fileName: string
}

export function PhotoUpload({
  token,
  existingPhotos,
}: {
  token: string
  existingPhotos: Photo[]
}) {
  const t = useTranslations("portal")
  const [photos, setPhotos] = useState<Photo[]>(existingPhotos)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const MAX_PHOTOS = 10

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    if (photos.length >= MAX_PHOTOS) {
      setError(t("maxPhotos", { max: MAX_PHOTOS }))
      return
    }

    setError("")
    setUploading(true)

    try {
      const file = files[0]
      const ext = file.name.split(".").pop() ?? "jpg"
      const filename = `tasks/${token}/${Date.now()}.${ext}`

      const blob = await upload(filename, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ token }),
      })

      setPhotos((prev) => [
        ...prev,
        { id: blob.url, fileUrl: blob.url, fileName: file.name },
      ])
    } catch (err) {
      console.error("photo upload failed", err)
      setError(t("uploadFailed"))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label={t("dismiss")}>
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              <Image
                src={photo.fileUrl}
                alt={photo.fileName}
                fill
                className="object-cover"
                sizes="33vw"
              />
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {photos.length < MAX_PHOTOS && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 py-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("uploading")}
              </>
            ) : (
              <>
                <Camera className="size-4" />
                {photos.length === 0 ? t("addPhotos") : t("addMorePhotos", { count: photos.length, max: MAX_PHOTOS })}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
