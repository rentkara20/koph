"use server"

import { and, eq, notInArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customerContacts,
  customers,
  customerSignatures,
  deliveryTaskItems,
  partners,
  partnerTasks,
  requestItems,
  requests,
  requestTypes,
  signatureRequests,
  signatureItemConditions,
} from "@/lib/db/schema"
import { parseSignatureSnapshot } from "@/lib/domain/signature-snapshot"
import { parseDepositNote, type DepositNote } from "@/lib/domain/deposit-note"
import { isCountersignStage } from "@/lib/domain/signature-stage"

type SignatureParty = {
  fullName: string
  nationalId: string | null
  signatureData: string
  signedAt: number
  ipAddress: string | null
  userAgent: string | null
  auditDataHash: string | null
} | null

export type DeliveryNoteData = {
  sig: {
    id: string
    documentName: string
    status: string
    createdAt: number
    requireNationalId: boolean
  }
  request: {
    requestNumber: string
    quoteNumber: string | null
    // The date for the direction this note documents: the delivery date on an
    // outbound note, the collection date on a collection receipt. Resolved
    // here so the view never has to know which column to read.
    movementDate: number | null
    // Both raw dates. A collection receipt prints the pair, so the whole rental
    // period — went out on X, came back on Y — reads off a single page.
    deliveryDate: number | null
    collectionDate: number | null
    // Request type slug. Drives the note's wording — a collection is a receipt
    // FROM the customer, not a delivery TO them. Null on notes whose request
    // was deleted, which fall back to the delivery wording.
    typeSlug: string | null
  } | null
  // The Kara side of a collection: who physically took the devices. Resolved
  // from the partner task covering this request. Used as the FALLBACK label on
  // the rep's box: a legacy note (or one whose countersignature is still
  // pending) prints this name over a blank line to sign by hand, while a
  // countersigned note prints the rep's captured signature instead.
  collectedBy: string | null
  // Top block = the customer/company on record (NOT the receiver).
  customer: {
    name: string
    contactPerson: string | null
    mobile: string | null
    email: string | null
    city: string | null
  } | null
  items: {
    id: string
    description: string
    brand: string | null
    model: string | null
    serialNumber: string | null
    quantity: number
    accessories: string | null
    condition: "good" | "damaged" | "missing" | null
    receivedQuantity: number | null
  }[]
  verificationId: string | null
  // Stage-1: the person who actually received & signed.
  signature: SignatureParty
  // Stage-2: authorised signatory (only when an admin requested it).
  authorized: SignatureParty
  // Verification id for the authorised signatory's own certificate (distinct
  // from the receiver's `verificationId` above).
  authorizedVerificationId: string | null
  // A stage-2 request exists (show the second box even while pending).
  requiresAuthorized: boolean
  // Name of the flagged authorised signatory (for the pending box label).
  authorizedName: string | null
  // Stage-2: Kara's own rep countersigning a collection. Null on deliveries and
  // on collections whose countersignature stage has not been opened.
  agent: SignatureParty
  // Verification id for the rep's own certificate.
  agentVerificationId: string | null
  // A Kara-rep countersignature stage exists (show the box even while pending).
  requiresAgent: boolean
  // Optional per-device deposit block. Prefers the frozen snapshot value over
  // the live signature-request column. Null when off / not opted in.
  depositNote: DepositNote | null
}

async function loadSignatureParty(signatureRequestId: string): Promise<SignatureParty> {
  const [row] = await db
    .select({
      fullName: customerSignatures.fullName,
      nationalId: customerSignatures.nationalId,
      signatureData: customerSignatures.signatureData,
      signedAt: customerSignatures.signedAt,
      ipAddress: customerSignatures.ipAddress,
    })
    .from(customerSignatures)
    .where(eq(customerSignatures.signatureRequestId, signatureRequestId))
  if (!row) return null

  // Audit columns may predate a migration on some environments — read defensively.
  let userAgent: string | null = null
  let auditDataHash: string | null = null
  try {
    const [af] = await db
      .select({ userAgent: customerSignatures.userAgent, auditDataHash: customerSignatures.auditDataHash })
      .from(customerSignatures)
      .where(eq(customerSignatures.signatureRequestId, signatureRequestId))
    userAgent = af?.userAgent ?? null
    auditDataHash = af?.auditDataHash ?? null
  } catch (error) {
    console.error("delivery-notes: swallowed fallback error", error)
    // columns not yet migrated — ignore
  }

  return { ...row, userAgent, auditDataHash }
}

/**
 * The Kara-side name for a collection receipt: the partner carrying out the
 * job. Two routes in, mirroring syncRequestStatus in lib/actions/tasks.ts —
 * Delivery Batching v2 lets one task span several requests, so the task's own
 * requestId column is advisory and the item bridge is the reliable link.
 * Cancelled/rejected tasks are ignored; they did not collect anything.
 */
async function loadCollectedBy(requestId: string): Promise<string | null> {
  const dead: (typeof partnerTasks.status.enumValues)[number][] = [
    "cancelled",
    "rejected",
    "failed",
  ]
  const [byColumn, byItems] = await Promise.all([
    db
      .select({ name: partners.name, contactPerson: partners.contactPerson })
      .from(partnerTasks)
      .innerJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .where(
        and(eq(partnerTasks.requestId, requestId), notInArray(partnerTasks.status, dead))
      ),
    db
      .selectDistinct({ name: partners.name, contactPerson: partners.contactPerson })
      .from(partnerTasks)
      .innerJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .innerJoin(deliveryTaskItems, eq(deliveryTaskItems.partnerTaskId, partnerTasks.id))
      .innerJoin(requestItems, eq(requestItems.id, deliveryTaskItems.requestItemId))
      .where(
        and(eq(requestItems.requestId, requestId), notInArray(partnerTasks.status, dead))
      ),
  ])

  const row = byColumn[0] ?? byItems[0]
  if (!row) return null
  // "Contact — Company" when a named person is on file, company alone otherwise.
  return row.contactPerson ? `${row.contactPerson} — ${row.name}` : row.name
}

export async function getDeliveryNoteData(
  token: string
): Promise<DeliveryNoteData | null> {
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig) return null

  // The delivery note always renders around the RECEIVER (stage-1) request.
  // If the token belongs to the authorised (stage-2) request, resolve its parent.
  let receiverSig = sig
  if (isCountersignStage(sig.signatoryRole) && sig.parentSignatureRequestId) {
    const [parent] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, sig.parentSignatureRequestId))
    if (parent) receiverSig = parent
  }

  // The authorised (stage-2) request, if one was created for this delivery.
  const [authorizedSig] = await db
    .select()
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.parentSignatureRequestId, receiverSig.id),
        eq(signatureRequests.signatoryRole, "authorized")
      )
    )

  // The Kara-rep countersignature stage, if one was opened for this note.
  const [agentSig] = await db
    .select()
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.parentSignatureRequestId, receiverSig.id),
        eq(signatureRequests.signatoryRole, "kara_agent")
      )
    )

  const [customerRow] = await db
    .select({
      name: customers.name,
      contactPerson: customers.contactPerson,
      mobile: customers.mobile,
      email: customers.email,
      city: customers.city,
    })
    .from(customers)
    .where(eq(customers.id, receiverSig.customerId))

  // Whose signature STATES what was collected. Normally the customer's stage-1
  // note. On an agent-only receipt the customer never signed and the rep is the
  // only person who reported anything, so the statement — per-item conditions
  // and the frozen snapshot — comes from the rep's child instead. Without this
  // the receipt would print no condition at all and silently fall back to live
  // rows that later edits can rewrite.
  const statementSigId =
    receiverSig.status === "signed"
      ? receiverSig.id
      : agentSig?.status === "signed"
        ? agentSig.id
        : receiverSig.id

  let requestRow: DeliveryNoteData["request"] = null
  let items: DeliveryNoteData["items"] = []

  if (receiverSig.requestId) {
    const [r] = await db
      .select({
        requestNumber: requests.requestNumber,
        quoteNumber: requests.quoteNumber,
        deliveryDate: requests.deliveryDate,
        collectionDate: requests.collectionDate,
        typeSlug: requestTypes.slug,
      })
      .from(requests)
      .innerJoin(requestTypes, eq(requests.typeId, requestTypes.id))
      .where(eq(requests.id, receiverSig.requestId))
    requestRow = r
      ? {
          requestNumber: r.requestNumber,
          quoteNumber: r.quoteNumber,
          movementDate: r.typeSlug === "collection" ? r.collectionDate : r.deliveryDate,
          deliveryDate: r.deliveryDate,
          collectionDate: r.collectionDate,
          typeSlug: r.typeSlug,
        }
      : null

    const rawItems = await db
      .select({
        id: requestItems.id,
        description: requestItems.description,
        brand: requestItems.brand,
        model: requestItems.model,
        serialNumber: requestItems.serialNumber,
        quantity: requestItems.quantity,
        accessories: requestItems.accessories,
      })
      .from(requestItems)
      .where(eq(requestItems.requestId, receiverSig.requestId))

    const conditionRows = await db
      .select({
        requestItemId: signatureItemConditions.requestItemId,
        condition: signatureItemConditions.condition,
        receivedQuantity: signatureItemConditions.receivedQuantity,
      })
      .from(signatureItemConditions)
      .where(eq(signatureItemConditions.signatureRequestId, statementSigId))
    const conditionMap = new Map(conditionRows.map((c) => [c.requestItemId, c]))

    items = rawItems.map((i) => {
      const c = conditionMap.get(i.id)
      return { ...i, condition: c?.condition ?? null, receivedQuantity: c?.receivedQuantity ?? null }
    })
  }

  // Resolve the flagged authorised signatory's name (for the pending box label).
  let authorizedName: string | null = null
  if (authorizedSig?.signatoryContactId) {
    const [c] = await db
      .select({ name: customerContacts.name })
      .from(customerContacts)
      .where(eq(customerContacts.id, authorizedSig.signatoryContactId))
    authorizedName = c?.name ?? null
  }

  const receiverParty = await loadSignatureParty(receiverSig.id)
  const authorizedParty = authorizedSig ? await loadSignatureParty(authorizedSig.id) : null
  const agentParty = agentSig ? await loadSignatureParty(agentSig.id) : null

  // Prefer the immutable snapshot frozen at signing time. Falls back to the
  // live rows loaded above for legacy signatures (signed before snapshots
  // existed) or requests that were never signed.
  const [snapRow] = await db
    .select({ snapshot: customerSignatures.snapshot })
    .from(customerSignatures)
    .where(eq(customerSignatures.signatureRequestId, statementSigId))
  // Deposit note: live column by default; the frozen snapshot value wins when a
  // snapshot exists (same override pattern as items/customer below).
  let depositNote = parseDepositNote(receiverSig.depositNote)

  const snapshot = parseSignatureSnapshot(snapRow?.snapshot)
  if (snapshot) {
    if (snapshot.depositNote) depositNote = snapshot.depositNote
    if (snapshot.items.length > 0) {
      items = snapshot.items.map((i) => ({
        id: i.id,
        description: i.description,
        brand: i.brand,
        model: i.model,
        serialNumber: i.serialNumber,
        quantity: i.quantity,
        accessories: i.accessories,
        condition: i.condition,
        receivedQuantity: i.receivedQuantity,
      }))
    }
    if (snapshot.customer && customerRow) {
      // Keep email from the live customer row (not snapshotted); freeze the rest.
      customerRow.name = snapshot.customer.name ?? customerRow.name
      customerRow.contactPerson = snapshot.customer.contactPerson ?? customerRow.contactPerson
      customerRow.mobile = snapshot.customer.mobile ?? customerRow.mobile
      customerRow.city = snapshot.customer.city ?? customerRow.city
    }
    if (requestRow && snapshot.requestNumber) {
      requestRow = { ...requestRow, requestNumber: snapshot.requestNumber, quoteNumber: snapshot.quoteNumber }
    }
  }

  return {
    sig: {
      id: receiverSig.id,
      documentName: receiverSig.documentName,
      status: receiverSig.status,
      createdAt: receiverSig.createdAt,
      requireNationalId: receiverSig.requireNationalId,
    },
    verificationId: receiverSig.verificationId ?? null,
    request: requestRow,
    collectedBy:
      requestRow?.typeSlug === "collection" && receiverSig.requestId
        ? await loadCollectedBy(receiverSig.requestId)
        : null,
    customer: customerRow ?? null,
    items,
    signature: receiverParty,
    authorized: authorizedParty,
    authorizedVerificationId: authorizedSig?.verificationId ?? null,
    requiresAuthorized: !!authorizedSig,
    authorizedName,
    agent: agentParty,
    agentVerificationId: agentSig?.verificationId ?? null,
    requiresAgent: !!agentSig,
    depositNote,
  }
}
