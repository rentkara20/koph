import Link from "next/link"
import { notFound } from "next/navigation"
import { getLabelBatch } from "@/lib/actions/label-studio"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils/format"

/** A registered batch: what was printed, when, and where each sticker points. */
export default async function LabelBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  const result = await getLabelBatch(batchId)

  if ("error" in result) {
    if (result.error === "not_found") notFound()
    return <p className="text-sm text-destructive">غير مصرّح</p>
  }

  const { batch, devices } = result

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/labels"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← كل الدفعات
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{batch.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(batch.createdAt)}
          {batch.sourceFile ? ` · ${batch.sourceFile}` : ""} · {devices.length} جهاز
        </p>
        <p className="font-mono text-xs text-muted-foreground" dir="ltr">
          {batch.baseUrl}
        </p>
      </div>

      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start">السيريال</th>
              <th className="px-4 py-2 text-start">الماركة</th>
              <th className="px-4 py-2 text-start">الموديل</th>
              <th className="px-4 py-2 text-start">اللينك</th>
              <th className="px-4 py-2 text-start">الطباعة</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {devices.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-mono" dir="ltr">
                  {d.serialNumber}
                </td>
                <td className="px-4 py-2">{d.brand || "—"}</td>
                <td className="max-w-xs truncate px-4 py-2">{d.model || "—"}</td>
                <td className="px-4 py-2">
                  <Link
                    href={`/d/${d.serialKey}`}
                    className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                    dir="ltr"
                  >
                    /d/{d.serialKey}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {d.printedAt ? (
                    <Badge variant="outline">{formatDate(d.printedAt)}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
