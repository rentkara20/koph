"use client"

import { useState, useRef } from "react"
import { useTranslations } from "next-intl"
import { upload } from "@vercel/blob/client"
import { shrinkImage } from "@/lib/utils/image-resize"
import { deleteTaskPhotoByToken, getTaskPhotosByToken } from "@/lib/actions/tasks"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Camera, X, Loader2, Trash2, ZoomIn } from "lucide-react"
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
  const [stage, setStage] = useState<"preparing" | "uploading">("uploading")
  // The photo being viewed full-size, and the one being removed.
  const [viewing, setViewing] = useState<Photo | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
      // Downscale first: a straight-from-camera photo is several megabytes, and
      // on mobile data that upload reads as a frozen page.
      setStage("preparing")
      const file = await shrinkImage(files[0])
      const ext = file.name.split(".").pop() ?? "jpg"
      const filename = `tasks/${token}/${Date.now()}.${ext}`

      setStage("uploading")
      const blob = await upload(filename, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ token }),
      })

      // The attachment row is written by the upload webhook, so its id is not
      // in the client's hands. Re-read the task's photos instead of inventing
      // one: the list then reflects what was actually stored, and each photo
      // carries the id that delete needs.
      const stored = await getTaskPhotosByToken(token)
      if (stored.length > 0) {
        setPhotos(stored.map((p) => ({ id: p.id, fileUrl: p.fileUrl, fileName: p.fileName })))
      } else {
        setPhotos((prev) => [...prev, { id: blob.url, fileUrl: blob.url, fileName: file.name }])
      }
    } catch (err) {
      console.error("photo upload failed", err)
      setError(t("uploadFailed"))
    } finally {
      setUploading(false)
      setStage("uploading")
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleDelete(photo: Photo) {
    if (!window.confirm(t("deletePhotoConfirm"))) return
    setDeletingId(photo.id)
    setError("")
    const result = await deleteTaskPhotoByToken(token, photo.id)
    setDeletingId(null)
    if (result.error) {
      setError(translateActionError(result.error))
      return
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    setViewing(null)
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
              <button
                type="button"
                onClick={() => setViewing(photo)}
                className="absolute inset-0 z-10"
                aria-label={t("viewPhoto")}
              >
                <Image
                  src={photo.fileUrl}
                  alt={photo.fileName}
                  fill
                  className="object-cover"
                  sizes="33vw"
                />
                <span className="absolute bottom-1 start-1 rounded-md bg-black/45 p-1 text-white">
                  <ZoomIn className="size-3.5" aria-hidden />
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(photo)}
                disabled={deletingId === photo.id}
                aria-label={t("deletePhoto")}
                className="absolute top-1 end-1 z-20 rounded-full bg-black/55 p-1.5 text-white disabled:opacity-50"
              >
                {deletingId === photo.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
              </button>
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
                {stage === "preparing" ? t("preparingPhoto") : t("uploading")}
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

      {/* Full-size viewer. Fixed overlay so a photo can actually be checked on
          a phone before it is kept or removed. */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
          <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
            <button
              type="button"
              onClick={() => setViewing(null)}
              aria-label={t("dismiss")}
              className="rounded-lg bg-white/15 p-2"
            >
              <X className="size-5" aria-hidden />
            </button>
            <p className="truncate px-3 text-xs opacity-80">{viewing.fileName}</p>
            <button
              type="button"
              onClick={() => handleDelete(viewing)}
              disabled={deletingId === viewing.id}
              aria-label={t("deletePhoto")}
              className="rounded-lg bg-red-600/90 p-2 disabled:opacity-50"
            >
              {deletingId === viewing.id ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-5" aria-hidden />
              )}
            </button>
          </div>
          <div className="relative flex-1">
            <Image
              src={viewing.fileUrl}
              alt={viewing.fileName}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>
        </div>
      )}
    </div>
  )
}
