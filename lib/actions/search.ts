"use server"

import { and, isNull, like, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, partners, requests } from "@/lib/db/schema"
import { getSession } from "@/lib/auth/session"

export async function globalSearch(query: string) {
  const session = await getSession()
  if (!session) return null

  const q = query?.trim()
  if (!q || q.length < 2) return { customers: [], requests: [], partners: [] }

  const like_q = `%${q}%`

  const [customerResults, requestResults, partnerResults] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        mobile: customers.mobile,
        city: customers.city,
        email: customers.email,
      })
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          or(
            like(customers.name, like_q),
            like(customers.mobile, like_q),
            like(customers.email, like_q),
            like(customers.city, like_q)
          )
        )
      )
      .limit(8),

    db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        trackingCode: requests.trackingCode,
        status: requests.status,
        notes: requests.notes,
      })
      .from(requests)
      .where(
        and(
          isNull(requests.deletedAt),
          or(
            like(requests.quoteNumber, like_q),
            like(requests.requestNumber, like_q),
            like(requests.trackingCode, like_q),
            like(requests.notes, like_q),
            like(requests.salesRef, like_q),
            like(requests.poNumber, like_q)
          )
        )
      )
      .limit(8),

    db
      .select({
        id: partners.id,
        name: partners.name,
        mobile: partners.mobile,
        email: partners.email,
        status: partners.status,
      })
      .from(partners)
      .where(
        and(
          isNull(partners.deletedAt),
          or(
            like(partners.name, like_q),
            like(partners.mobile, like_q),
            like(partners.email, like_q)
          )
        )
      )
      .limit(8),
  ])

  return { customers: customerResults, requests: requestResults, partners: partnerResults }
}
