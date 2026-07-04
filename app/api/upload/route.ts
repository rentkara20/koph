import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { del } from "@vercel/blob"
import { and, count, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerTasks, attachments } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
const MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB
const MAX_PHOTOS_PER_TASK = 10

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload, _multipart) => {
        const { token } = JSON.parse(clientPayload ?? "{}")
        if (!token) throw new Error("Missing task token")

        const task = await db.query.partnerTasks.findFirst({
          where: eq(partnerTasks.taskToken, token as string),
        })
        if (!task) throw new Error("Task not found")
        if (task.status !== "in_progress") throw new Error("Task is not in progress")

        const now = Date.now()
        if (task.taskTokenExpiresAt < now) throw new Error("Task link expired")

        const [{ value: photoCount }] = await db
          .select({ value: count() })
          .from(attachments)
          .where(
            and(eq(attachments.entityId, task.id), eq(attachments.entityType, "partner_task"))
          )

        if (photoCount >= MAX_PHOTOS_PER_TASK) {
          throw new Error(`Maximum ${MAX_PHOTOS_PER_TASK} photos allowed per task`)
        }

        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          tokenPayload: JSON.stringify({ taskId: task.id }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { taskId } = JSON.parse(tokenPayload ?? "{}")
        if (!taskId) return

        // Re-check the cap here to close the TOCTOU window: two concurrent
        // uploads can both pass onBeforeGenerateToken. If we're already at the
        // limit, drop this blob instead of persisting an over-limit photo.
        const [{ value: photoCount }] = await db
          .select({ value: count() })
          .from(attachments)
          .where(and(eq(attachments.entityId, taskId as string), eq(attachments.entityType, "partner_task")))

        if (photoCount >= MAX_PHOTOS_PER_TASK) {
          await del(blob.url).catch(() => {})
          return
        }

        // Capture the real byte size (not available on the callback payload) via
        // a HEAD request so future storage reporting isn't silently wrong.
        let fileSize = 0
        try {
          const head = await fetch(blob.url, { method: "HEAD" })
          fileSize = Number(head.headers.get("content-length") ?? 0)
        } catch {
          fileSize = 0
        }

        await db.insert(attachments).values({
          id: createId(),
          entityType: "partner_task",
          entityId: taskId as string,
          fileName: blob.pathname.split("/").pop() ?? blob.pathname,
          fileUrl: blob.url,
          fileType: blob.contentType ?? "image/jpeg",
          fileSize,
          uploadSource: "partner_link",
        })
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}
