import Link from "next/link"
import { getLabelBaseUrl, listLabelBatches } from "@/lib/actions/label-studio"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils/format"
import { LabelStudio } from "./_components/label-studio"

/**
 * Label studio: upload serials → validate → preview at real size → download a
 * print file → register the batch.
 *
 * Registration writes only the isolated label tables. It never touches
 * order_unit: a sticker is an identity for a device, not a claim about
 * inventory.
 */
export default async function LabelsPage() {
  const [result, baseUrl] = await Promise.all([listLabelBatches(), getLabelBaseUrl()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ملصقات الأجهزة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ارفع ملف سيريالات، عاين الملصقات بالمقاس الحقيقي، ثم نزّل ملف الطباعة.
        </p>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
        اللينك المطبوع حالياً{" "}
        <span dir="ltr" className="font-mono font-semibold">
          {baseUrl}
        </span>{" "}
        — للتجربة فقط. ملصقات الإنتاج تنتظر النطاق النهائي، لأن ما يُطبع لا يمكن تغييره.
      </div>

      <LabelStudio baseUrl={baseUrl} />

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">الدفعات المسجّلة</h2>
        </header>
        {"error" in result ? (
          <p className="px-4 py-6 text-sm text-destructive">غير مصرّح</p>
        ) : result.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            لا توجد دفعات بعد
          </p>
        ) : (
          <ul className="divide-y">
            {result.rows.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(b.createdAt)}
                    {b.sourceFile ? ` · ${b.sourceFile}` : ""}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {b.baseUrl}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{b.devices} جهاز</Badge>
                  {b.printed > 0 && <Badge variant="outline">{b.printed} مطبوع</Badge>}
                  <Link
                    href={`/admin/labels/${b.id}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    عرض
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
