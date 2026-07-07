"use server"

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customerContacts,
  customers,
  customerSignatures,
  requestItems,
  requests,
  signatureRequests,
  signatureItemConditions,
} from "@/lib/db/schema"

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
    deliveryDate: number | null
  } | null
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
  if (sig.signatoryRole === "authorized" && sig.parentSignatureRequestId) {
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

  let requestRow: DeliveryNoteData["request"] = null
  let items: DeliveryNoteData["items"] = []

  if (receiverSig.requestId) {
    const [r] = await db
      .select({
        requestNumber: requests.requestNumber,
        quoteNumber: requests.quoteNumber,
        deliveryDate: requests.deliveryDate,
      })
      .from(requests)
      .where(eq(requests.id, receiverSig.requestId))
    requestRow = r ?? null

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
      .where(eq(signatureItemConditions.signatureRequestId, receiverSig.id))
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
    customer: customerRow ?? null,
    items,
    signature: receiverParty,
    authorized: authorizedParty,
    authorizedVerificationId: authorizedSig?.verificationId ?? null,
    requiresAuthorized: !!authorizedSig,
    authorizedName,
  }
}
