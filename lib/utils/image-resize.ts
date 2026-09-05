// Photos are taken on a phone and uploaded over mobile data. A current iPhone
// still image is 3-5 MB, which is slow enough to look like the page has hung,
// and none of that resolution is useful as delivery evidence. Downscale in the
// browser before uploading: the bytes that leave the handset are the bytes we
// pay to store and the bytes the courier waits for.

export const MAX_IMAGE_DIMENSION = 1600
export const IMAGE_QUALITY = 0.8

/**
 * Longest edge capped at `max`, aspect ratio preserved, never upscaled.
 * Kept separate from the canvas work so the arithmetic is testable.
 */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_IMAGE_DIMENSION
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 }
  }
  const longest = Math.max(width, height)
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) }
  const scale = max / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Best-effort downscale to JPEG. Returns the ORIGINAL file unchanged on any
 * failure — an unsupported codec (HEIC on a browser that cannot decode it), a
 * missing canvas, an out-of-memory decode. Never throws: a slow upload beats a
 * courier who cannot attach proof at all.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    if (width === 0 || height === 0) {
      bitmap.close?.()
      return file
    }
    // Already small enough and already a JPEG: re-encoding would only lose data.
    if (width === bitmap.width && height === bitmap.height && file.type === "image/jpeg") {
      bitmap.close?.()
      return file
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY)
    )
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified })
  } catch {
    return file
  }
}
