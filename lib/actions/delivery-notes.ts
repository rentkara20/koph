"use server"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customerContacts,
  customers,
  customerSignatures,
  requestItems,
  requests,
  signatureRequests,
} from "@/lib/db/schema"

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
  customer: {
    name: string
    contactPerson: string | null
    mobile: string | null
    email: string | null
  } | null
  contact: {
    name: string
    mobile: string | null
    email: string | null
  } | null
  items: {
    id: string
    description: string
    brand: string | null
    model: string | null
    serialNumber: string | null
    quantity: number
    accessories: string | null
  }[]
  signature: {
    fullName: string
    nationalId: string | null
    signatureData: string
    signedAt: number
  } | null
}

export async function getDeliveryNoteData(
  token: string
): Promise<DeliveryNoteData | null> {
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig) return null

  const [customerRow] = await db
    .select({
      name: customers.name,
      contactPerson: customers.contactPerson,
      mobile: customers.mobile,
      email: customers.email,
    })
    .from(customers)
    .where(eq(customers.id, sig.customerId))

  const [contactRow] = await db
    .select({
      name: customerContacts.name,
      mobile: customerContacts.mobile,
      email: customerContacts.email,
    })
    .from(customerContacts)
    .where(eq(customerContacts.customerId, sig.customerId))
    .limit(1)

  let requestRow = null
  let items: DeliveryNoteData["items"] = []

  if (sig.requestId) {
    const [r] = await db
      .select({
        requestNumber: requests.requestNumber,
        quoteNumber: requests.quoteNumber,
        deliveryDate: requests.deliveryDate,
      })
      .from(requests)
      .where(eq(requests.id, sig.requestId))

    requestRow = r ?? null

    items = await db
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
      .where(eq(requestItems.requestId, sig.requestId))
  }

  const [sigData] = await db
    .select({
      fullName: customerSignatures.fullName,
      nationalId: customerSignatures.nationalId,
      signatureData: customerSignatures.signatureData,
      signedAt: customerSignatures.signedAt,
    })
    .from(customerSignatures)
    .where(eq(customerSignatures.signatureRequestId, sig.id))

  return {
    sig: {
      id: sig.id,
      documentName: sig.documentName,
      status: sig.status,
      createdAt: sig.createdAt,
      requireNationalId: sig.requireNationalId,
    },
    request: requestRow,
    customer: customerRow ?? null,
    contact: contactRow ?? null,
    items,
    signature: sigData ?? null,
  }
}
