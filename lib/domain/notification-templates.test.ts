import { describe, expect, test } from "vitest"
import {
  notificationLinkUrl,
  notificationTemplateForEvent,
} from "./notification-templates"

describe("notificationTemplateForEvent", () => {
  test("returns null for events that are not user-facing", () => {
    for (const eventType of ["AssetReserved", "SignatureSent", "PurchaseOrderCreated", "Unknown"]) {
      expect(
        notificationTemplateForEvent(eventType, {
          aggregateType: "asset",
          aggregateId: "a1",
          payload: {},
        })
      ).toBeNull()
    }
  })

  test("SignatureCompleted maps to customer_signed for the receiver stage", () => {
    const t = notificationTemplateForEvent("SignatureCompleted", {
      aggregateType: "signature_request",
      aggregateId: "sig-1",
      payload: { signatoryRole: "receiver", requestId: "req-1" },
    })
    expect(t?.type).toBe("customer_signed")
    expect(t?.i18nKey).toBe("notifications.customerSigned")
  })

  test("SignatureCompleted maps to fully_signed for the authorized stage", () => {
    const t = notificationTemplateForEvent("SignatureCompleted", {
      aggregateType: "signature_request",
      aggregateId: "sig-1",
      payload: { signatoryRole: "authorized", requestId: "req-1" },
    })
    expect(t?.type).toBe("fully_signed")
    expect(t?.i18nKey).toBe("notifications.fullySigned")
  })

  test("carries paymentCount from the payload for PaymentBatchGenerated", () => {
    const t = notificationTemplateForEvent("PaymentBatchGenerated", {
      aggregateType: "payment_batch",
      aggregateId: "batch-1",
      payload: { paymentCount: 4 },
    })
    expect(t?.i18nData).toEqual({ paymentCount: 4 })
  })
})

describe("notificationLinkUrl", () => {
  test("routes each aggregate type to its admin page", () => {
    expect(
      notificationLinkUrl({ aggregateType: "request", aggregateId: "r1", payload: {} })
    ).toBe("/admin/requests/r1")
    expect(
      notificationLinkUrl({ aggregateType: "payment_batch", aggregateId: "b1", payload: {} })
    ).toBe("/admin/payments/b1")
    expect(
      notificationLinkUrl({ aggregateType: "purchase_order", aggregateId: "p1", payload: {} })
    ).toBe("/admin/procurement/p1")
  })

  test("signature_request links to the owning request when present, else the list", () => {
    expect(
      notificationLinkUrl({
        aggregateType: "signature_request",
        aggregateId: "s1",
        payload: { requestId: "r9" },
      })
    ).toBe("/admin/requests/r9")
    expect(
      notificationLinkUrl({ aggregateType: "signature_request", aggregateId: "s1", payload: {} })
    ).toBe("/admin/signatures")
  })
})

describe("pickup + procurement events", () => {
  const ctx = (payload: Record<string, unknown>) => ({ aggregateType: "task", aggregateId: "task1", payload })

  test("PickupTaskPickedUp → in-transit notification linking to the PO", () => {
    const tpl = notificationTemplateForEvent("PickupTaskPickedUp", ctx({ purchaseOrderId: "po1", totalCollected: 8 }))
    expect(tpl?.type).toBe("pickup_in_transit")
    expect(tpl?.i18nData?.quantity).toBe(8)
    expect(tpl?.entityId).toBe("po1")
    expect(notificationLinkUrl(ctx({ purchaseOrderId: "po1" }))).toBe("/admin/procurement/po1")
  })

  test("PickupTaskClosed → received notification", () => {
    const tpl = notificationTemplateForEvent("PickupTaskClosed", ctx({ purchaseOrderId: "po1" }))
    expect(tpl?.type).toBe("pickup_received")
  })

  test("ProcurementCaseClosed surfaces", () => {
    const tpl = notificationTemplateForEvent("ProcurementCaseClosed", ctx({ purchaseOrderId: "po1" }))
    expect(tpl?.type).toBe("procurement_case_closed")
  })
})
