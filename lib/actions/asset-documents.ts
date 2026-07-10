"use server"

// Asset Documents (Milestone 2 / B4). Provider-neutral attachment metadata
// (provider/providerFileId/providerUrl/storagePath/sensitivity — see
// lib/db/schema.ts) so a future adapter (e.g. Google Drive) can plug in
// without a new schema column. Only "vercel_blob" is wired for now.
import { and, count, desc, eq } from "drizzle-orm"
import { put, del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { attachments, orderUnits } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"

type ActionResult = { error?: string; id?: string }

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]
const MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB
const MAX_DOCUMENTS_PER_ASSET = 30

export async function getAssetDocuments(assetId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityId, assetId), eq(attachments.entityType, "asset")))
    .orderBy(desc(attachments.createdAt))
}

// Session-independent core so integration tests / scripts can exercise the
// upload path directly (getSessionWithRole depends on next/headers and only
// resolves inside a real request).
export async function uploadAssetDocumentCore(
  input: { assetId: string; file: File; kind: string; sensitivity: "sensitive" | "operational" },
  actorUserId: string | null
): Promise<{ id: string }> {
  const { assetId, file, kind, sensitivity } = input

  if (!assetId) throw new Error("Asset not found")
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Unsupported file type")
  if (file.size > MAX_SIZE_BYTES) throw new Error("File too large")

  const [asset] = await db.select({ id: orderUnits.id }).from(orderUnits).where(eq(orderUnits.id, assetId))
  if (!asset) throw new Error("Asset not found")

  const [{ value: docCount }] = await db
    .select({ value: count() })
    .from(attachments)
    .where(and(eq(attachments.entityId, assetId), eq(attachments.entityType, "asset")))
  if (docCount >= MAX_DOCUMENTS_PER_ASSET) {
    throw new Error(`Maximum ${MAX_DOCUMENTS_PER_ASSET} documents allowed per asset`)
  }

  const blob = await put(`assets/${assetId}/${kind}-${createId()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: false,
  })

  const id = createId()
  await db.insert(attachments).values({
    id,
    entityType: "asset",
    entityId: assetId,
    fileName: file.name,
    fileUrl: blob.url,
    fileType: file.type,
    fileSize: file.size,
    uploadedBy: actorUserId,
    uploadSource: "admin",
    provider: "vercel_blob",
    providerFileId: blob.pathname,
    providerUrl: blob.url,
    storagePath: blob.pathname,
    sensitivity,
  })

  return { id }
}

export async function uploadAssetDocument(formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const assetId = String(formData.get("assetId") ?? "")
  const file = formData.get("file")
  const kind = String(formData.get("kind") ?? "other")
  const sensitivity = formData.get("sensitivity") === "operational" ? "operational" : "sensitive"

  if (!(file instanceof File)) return { error: "No file provided" }

  try {
    const result = await uploadAssetDocumentCore({ assetId, file, kind, sensitivity }, session.user.id)
    revalidatePath(`/admin/assets/${assetId}`)
    return { id: result.id }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to upload document" }
  }
}

export async function deleteAssetDocumentCore(id: string): Promise<{ id: string; entityId: string }> {
  const [doc] = await db.select().from(attachments).where(eq(attachments.id, id))
  if (!doc || doc.entityType !== "asset") throw new Error("Document not found")

  if (doc.provider === "vercel_blob" && doc.providerUrl) {
    await del(doc.providerUrl).catch(() => {})
  }
  await db.delete(attachments).where(eq(attachments.id, id))

  return { id, entityId: doc.entityId }
}

export async function deleteAssetDocument(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  try {
    const result = await deleteAssetDocumentCore(id)
    revalidatePath(`/admin/assets/${result.entityId}`)
    return { id: result.id }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete document" }
  }
}
