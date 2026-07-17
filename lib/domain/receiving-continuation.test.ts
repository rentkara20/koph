import { describe, expect, it } from "vitest"
import { deriveReceivingContinuation } from "./receiving-continuation"

describe("deriveReceivingContinuation", () => {
  it("continues to QC when received devices require inspection", () => {
    expect(
      deriveReceivingContinuation({
        purchaseOrderId: "po-1",
        qcPending: 1,
        qcFailed: 0,
        deliverableCount: 0,
        linkedOrderNumber: "10101",
      })
    ).toEqual({ key: "qcDevices", href: "/admin/procurement/po-1#quality-inspection" })
  })

  it("blocks delivery and asks to resolve rejected devices", () => {
    expect(
      deriveReceivingContinuation({
        purchaseOrderId: "po-1",
        qcPending: 0,
        qcFailed: 1,
        deliverableCount: 0,
        failedAssetId: "asset-bad",
        linkedOrderNumber: "10101",
      })
    ).toEqual({ key: "resolveQcIssues", href: "/admin/assets/asset-bad" })
  })

  it("allows a partial delivery for passed devices while rejected devices stay behind", () => {
    expect(
      deriveReceivingContinuation({
        purchaseOrderId: "po-1",
        qcPending: 0,
        qcFailed: 1,
        deliverableCount: 1,
        linkedOrderNumber: "10101",
      })
    ).toEqual({
      key: "createPartialDelivery",
      href: "/admin/requests/new?orderNumber=10101&type=delivery",
    })
  })

  it("continues to a prefilled delivery request when devices are ready", () => {
    expect(
      deriveReceivingContinuation({
        purchaseOrderId: "po-1",
        qcPending: 0,
        qcFailed: 0,
        deliverableCount: 2,
        linkedOrderNumber: "10101",
      })
    ).toEqual({
      key: "createDeliveryJob",
      href: "/admin/requests/new?orderNumber=10101&type=delivery",
    })
  })

  it("returns stock purchases to their purchase order instead of inventing a customer delivery", () => {
    expect(
      deriveReceivingContinuation({
        purchaseOrderId: "po-1",
        qcPending: 0,
        qcFailed: 0,
        deliverableCount: 2,
        linkedOrderNumber: null,
      })
    ).toEqual({ key: "reviewInventory", href: "/admin/procurement/po-1" })
  })
})
