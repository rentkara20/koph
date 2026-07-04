import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { ShieldCheck } from "lucide-react"
import { qrDataUrl } from "@/lib/utils/qr"
import { formatAuditDateTime } from "@/lib/utils/format"

function maskNationalId(id: string | null): string {
  if (!id) return "—"
  if (id.length <= 4) return id
  return "•".repeat(id.length - 4) + id.slice(-4)
}

// Certificate of Completion (DocuSign pattern): appended to the signed delivery
// note with the signer's identity, timestamp, audit hash, and a QR pointing to
// the public verification page. Tamper-evident record for disputes.
export async function Certificate({
  signature,
  verificationId,
  documentName,
}: {
  signature: {
    fullName: string
    nationalId: string | null
    signedAt: number
    ipAddress: string | null
    auditDataHash: string | null
  }
  verificationId: string | null
  documentName: string
}) {
  const t = await getTranslations("certificate")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const verifyUrl = verificationId ? `${appUrl}/verify/${verificationId}` : appUrl
  const qr = await qrDataUrl(verifyUrl)

  const rows: { label: string; value: string }[] = [
    { label: t("documentName"), value: documentName },
    { label: t("signer"), value: signature.fullName },
    { label: t("nationalId"), value: maskNationalId(signature.nationalId) },
    { label: t("signedAt"), value: formatAuditDateTime(signature.signedAt) },
  ]
  if (verificationId) rows.push({ label: t("verificationId"), value: verificationId })
  if (signature.ipAddress) rows.push({ label: t("ipAddress"), value: signature.ipAddress })

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <ShieldCheck className="size-5 text-kara-purple" aria-hidden />
        <h2 className="text-sm font-semibold">{t("title")}</h2>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <dl className="flex-1 space-y-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap gap-x-2">
              <dt className="min-w-32 text-muted-foreground">{r.label}</dt>
              <dd className="font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Image
            src={qr}
            alt={t("scanToVerify")}
            width={120}
            height={120}
            className="rounded-md border border-border bg-white p-1"
            unoptimized
          />
          <p className="text-[10px] text-muted-foreground">{t("scanToVerify")}</p>
        </div>
      </div>

      {signature.auditDataHash && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{t("auditHash")}</p>
          <p className="mt-0.5 break-all font-mono text-[10px] text-foreground/70">
            {signature.auditDataHash}
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t("tamperNote")}</p>
      {verificationId && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("verifyAt")} <span className="font-mono">{verifyUrl}</span>
        </p>
      )}
    </section>
  )
}
