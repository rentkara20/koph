import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { getLocale, getTranslations } from "next-intl/server"
import { localizeDocumentName, splitDocumentName } from "@/lib/utils/document-name"
import { isCountersignStage, stageInspectsItems } from "@/lib/domain/signature-stage"
import { TriangleAlert } from "lucide-react"
import {
  getPendingAgentCountersignToken,
  getSignatureByToken,
  recordSignatureOpened,
} from "@/lib/actions/signatures"
import { getDeliveryNoteData } from "@/lib/actions/delivery-notes"
import { formatDate } from "@/lib/utils/format"
import { SignatureForm } from "./_components/signature-form"
import { ReceiverConfirmationCard } from "./_components/receiver-confirmation-card"
import { DeliveryNoteView } from "./_components/delivery-note-view"
import { DownloadButton } from "./_components/download-button"
import { SignHeader } from "./_components/sign-header"
import { TrustBand } from "./_components/trust-band"
import { DepositSummaryCard } from "./_components/deposit-summary-card"
import { TerminalState, type TerminalKind } from "./_components/terminal-state"
import { Certificate } from "./_components/certificate"
import { signatureStatusVariant as STATUS_VARIANT } from "@/lib/domain/status-variant"

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [data, deliveryNote, t] = await Promise.all([
    getSignatureByToken(token),
    getDeliveryNoteData(token),
    getTranslations("signatures.signing"),
  ])
  const tKind = await getTranslations("signatures.documentKind")

  if (!data) notFound()

  const { sig, activeConsent, isExpired } = data

  if (sig.status === "sent") {
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined
    const ua = headersList.get("user-agent") ?? undefined
    await recordSignatureOpened(token, ip, ua)
  }

  const items = deliveryNote?.items ?? []
  const request = deliveryNote?.request ?? null
  const customer = deliveryNote?.customer ?? null

  // ── Terminal / non-signable states ──────────────────────────────────────────
  const terminalKind: TerminalKind | null = isExpired
    ? "expired"
    : sig.status === "signed" && !deliveryNote
      ? "alreadySigned"
      : sig.status === "rejected"
        ? "declined"
        : sig.status === "cancelled"
          ? "cancelled"
          : sig.status === "draft"
            ? "notActive"
            : null

  if (terminalKind) {
    return <TerminalState kind={terminalKind} />
  }

  const isSigned = sig.status === "signed"
  const canSign = !isSigned && !isExpired && sig.status !== "draft"

  const now = Date.now()
  const isExpiringSoon =
    !isExpired &&
    !isSigned &&
    sig.expiryEnabled &&
    sig.expiresAt !== null &&
    sig.expiresAt > now &&
    sig.expiresAt - now < 24 * 60 * 60 * 1000

  const locale = await getLocale()
  const consentText =
    (locale === "ar" ? activeConsent?.textAr : activeConsent?.textEn) ?? t("consent")
  const statusLabel = isSigned ? t("signed") : t("title")

  // The stored document name is frozen English evidence; the signer reads it in
  // their own language. The kind alone titles the header and the certificate —
  // and it is read off THIS document, so a collection never says "delivery note".
  const documentKindLabel = tKind(splitDocumentName(sig.documentName).kind ?? "deliveryNote")
  // Only meaningful once stage 1 is signed; null on every other stage/channel.
  const agentCountersignToken = isSigned
    ? await getPendingAgentCountersignToken(sig.id)
    : null
  const localizedDocumentName = localizeDocumentName(sig.documentName, (k) => tKind(k))
  // A collection receipt documents the date the devices came BACK. Labelling
  // that "التسليم" on the review card told the signer the wrong direction.
  const movementDateLabel =
    request?.typeSlug === "collection" ? t("collectionDateLabel") : t("delivery")

  return (
    <div className="min-h-svh bg-muted/40">
      <SignHeader
        documentName={documentKindLabel}
        subtitle={customer?.name}
        statusLabel={statusLabel}
        statusVariant={STATUS_VARIANT[sig.status] ?? "outline"}
      />

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5">
        <TrustBand requestedBy={customer?.name} />

        {isExpiringSoon && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span>{t("expiringSoon")}</span>
          </div>
        )}

        {isSigned && deliveryNote ? (
          <>
            <div className="rounded-xl border border-kara-blue/20 bg-kara-blue-soft px-4 py-3 text-sm font-semibold text-kara-blue">
              {t("signed")}
            </div>
            {/* The rep's turn, on the tablet the customer just handed back.
                Rendered as a plain link so it survives with JS disabled and
                needs no client bundle on the signing page. */}
            {agentCountersignToken && (
              <a
                href={`/sign/${agentCountersignToken}`}
                className="rounded-xl border border-kara-purple/30 bg-kara-purple/5 px-4 py-3 text-sm font-semibold text-kara-purple underline-offset-4 hover:underline"
              >
                {t("agentCountersignCta")}
              </a>
            )}
            <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
              <DeliveryNoteView data={deliveryNote} />
            </div>
            {/* Certificate is scoped to whoever holds THIS token — the
                receiver and the authorised signatory each get proof of
                their own signature, not each other's. */}
            {(() => {
              // Three stages can hold a token, and each gets proof of THEIR OWN
              // signature only — the customer's certificate must never carry
              // Kara's rep's signature, or the other way round.
              const stage =
                sig.signatoryRole === "authorized"
                  ? { party: deliveryNote.authorized, id: deliveryNote.authorizedVerificationId }
                  : sig.signatoryRole === "kara_agent"
                    ? { party: deliveryNote.agent, id: deliveryNote.agentVerificationId }
                    : { party: deliveryNote.signature, id: deliveryNote.verificationId }
              const certificateParty = stage.party
              const certificateVerificationId = stage.id
              return (
                certificateParty && (
                  <Certificate
                    signature={certificateParty}
                    verificationId={certificateVerificationId}
                    documentName={documentKindLabel}
                  />
                )
              )
            })()}
            <DownloadButton token={token} />
          </>
        ) : (
          <>
            {/* Items review card */}
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <header className="flex items-center justify-between gap-3 bg-kara-purple px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary-foreground">
                    {documentKindLabel}
                  </p>
                  {request?.requestNumber && (
                    <p className="truncate font-mono text-xs text-primary-foreground/85">
                      {request.requestNumber}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-end">
                  {request?.quoteNumber && (
                    <p className="font-mono text-sm font-bold text-primary-foreground">
                      #{request.quoteNumber}
                    </p>
                  )}
                  {request?.movementDate && (
                    <p className="text-xs text-primary-foreground/85">
                      {formatDate(request.movementDate)}
                    </p>
                  )}
                </div>
              </header>

              {items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-kara-blue text-start text-xs font-semibold text-primary-foreground">
                        <th className="px-4 py-2 text-start">{t("itemSpecs")}</th>
                        <th className="w-12 px-2 py-2 text-center">{t("qty")}</th>
                        <th className="w-[28%] px-4 py-2 text-start">{t("serialNumber")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={`border-b border-border ${idx % 2 ? "bg-muted/30" : ""}`}
                        >
                          <td className="px-4 py-2.5 align-top">
                            <p className="font-medium text-foreground">{item.description}</p>
                            {(item.brand || item.model) && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {[item.brand, item.model].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            {item.accessories && (
                              <p className="mt-0.5 text-xs text-muted-foreground/80">
                                + {item.accessories}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center align-top font-bold text-foreground">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-2.5 align-top font-mono text-xs text-muted-foreground">
                            {item.serialNumber ?? "—"}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50">
                        <td className="px-4 py-2 text-end text-sm font-bold text-foreground">
                          {t("total")}
                        </td>
                        <td className="px-2 py-2 text-center text-base font-extrabold text-kara-purple">
                          {items.reduce((s, i) => s + i.quantity, 0)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                  {t("noItems")}
                </p>
              )}
            </section>

            {/* Refundable security deposit — shown before signing so the
                customer reads the amount they are agreeing to. */}
            {deliveryNote?.depositNote && (
              <DepositSummaryCard depositNote={deliveryNote.depositNote} />
            )}

            {/* Document meta */}
            {(request?.quoteNumber || customer?.name || request?.movementDate) && (
              <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-xs">
                {customer?.name && (
                  <div>
                    <span className="text-muted-foreground">{t("preparedFor")}: </span>
                    <strong className="text-foreground">{customer.name}</strong>
                  </div>
                )}
                {request?.quoteNumber && (
                  <div>
                    <span className="text-muted-foreground">{t("quoteNo")}: </span>
                    <strong className="font-mono text-foreground" dir="ltr">{request.quoteNumber}</strong>
                  </div>
                )}
                {request?.movementDate && (
                  <div>
                    <span className="text-muted-foreground">{movementDateLabel}: </span>
                    <strong className="text-foreground">{formatDate(request.movementDate)}</strong>
                  </div>
                )}
              </div>
            )}

            {canSign && isCountersignStage(sig.signatoryRole) && deliveryNote?.signature && (
              <ReceiverConfirmationCard
                fullName={deliveryNote.signature.fullName}
                nationalId={deliveryNote.signature.nationalId}
                signedAt={deliveryNote.signature.signedAt}
                signatureData={deliveryNote.signature.signatureData}
              />
            )}

            {canSign && (
              <SignatureForm
                token={token}
                requireNationalId={sig.requireNationalId}
                documentName={localizedDocumentName}
                consentText={consentText}
                // Authorised signatory co-signs the record — they did not
                // physically inspect the items, so no condition selector.
                items={
                  !stageInspectsItems(sig.signatoryRole)
                    ? []
                    : items.map((i) => ({
                        id: i.id,
                        description: i.description,
                        serialNumber: i.serialNumber,
                        quantity: i.quantity,
                      }))
                }
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
