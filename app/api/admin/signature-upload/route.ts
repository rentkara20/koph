import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getStaffSession } from "@/lib/auth/session"

// Admin-only blob upload for manually-returned signed receipts. Distinct from
// the partner task-photo endpoint (/api/upload): gated on a staff session, and
// accepts PDFs in addition to images.
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]
const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export async function POST(request: Request): Promise<Response> {
  const session = await getStaffSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_SIZE_BYTES,
        tokenPayload: JSON.stringify({ uploadedBy: session.user.id }),
      }),
      // Persistence happens via uploadManualSignature (called from the client
      // with the returned blob URL), so no onUploadCompleted work is needed.
      onUploadCompleted: async () => {},
    })
    return Response.json(jsonResponse)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    )
  }
}
