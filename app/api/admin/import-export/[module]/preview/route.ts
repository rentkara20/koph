import { getSessionWithRole } from "@/lib/auth/session"
import { isModuleKey, previewImport } from "@/lib/import-export/modules"
import { parseCsv } from "@/lib/import-export/csv"

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB — generous for a spreadsheet export

export async function POST(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
): Promise<Response> {
  const session = await getSessionWithRole("admin")
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { module } = await params
  if (!isModuleKey(module)) return Response.json({ error: "Unknown module" }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) return Response.json({ error: "No file uploaded" }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "File too large (max 5 MB)" }, { status: 400 })
  }

  const text = await file.text()
  const { rows } = parseCsv(text)
  if (rows.length === 0) return Response.json({ error: "CSV has no data rows" }, { status: 400 })

  try {
    const summary = await previewImport(module, rows, session.user.id)
    return Response.json(summary)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to process file" },
      { status: 400 }
    )
  }
}
