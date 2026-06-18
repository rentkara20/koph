"use server"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
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
    items,
    signature: sigData ?? null,
  }
}
