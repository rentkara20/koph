// Session-independent core for asset-document upload/delete. Kept in a plain
// (non-"use server") module on purpose: every export of a "use server" file is
// a directly-callable RPC endpoint, and these helpers take plain serializable
// args (no db/tx handle to gate them), so exporting them as endpoints would let
// an anonymous caller upload or delete attachments with no authorization. The
// guarded wrappers in asset-documents.ts import these and are the only public
// surface; integration tests / scripts can still import the core directly.
import { and, count, eq } from "drizzle-orm"
import { put, del } from "@vercel/blob"
import { db } from "@/lib/db"
import { attachments, orderUnits } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

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

  // Blob upload and DB insert can't share a transaction — if the insert
  // fails, delete the just-uploaded blob so no orphan file survives.
  const id = createId()
  try {
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
  } catch (error) {
    await del(blob.url).catch(() => {})
    throw error
  }

  return { id }
}

export async function deleteAssetDocumentCore(id: string): Promise<{ id: string; entityId: string }> {
  const [doc] = await db.select().from(attachments).where(eq(attachments.id, id))
  if (!doc || doc.entityType !== "asset") throw new Error("Document not found")

  // Delete the DB row first: if the blob delete then fails we only leak an
  // unreferenced blob, never a live record pointing at a missing file.
  await db.delete(attachments).where(eq(attachments.id, id))
  if (doc.provider === "vercel_blob" && doc.providerUrl) {
    await del(doc.providerUrl).catch(() => {})
  }

  return { id, entityId: doc.entityId }
}
