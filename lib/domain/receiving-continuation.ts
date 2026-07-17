export type ReceivingContinuation = {
  key: "qcDevices" | "resolveQcIssues" | "createPartialDelivery" | "createDeliveryJob" | "reviewInventory"
  href: string
}

export function deriveReceivingContinuation(input: {
  purchaseOrderId: string
  qcPending: number
  qcFailed: number
  deliverableCount: number
  failedAssetId?: string | null
  linkedOrderNumber: string | null
}): ReceivingContinuation {
  const poHref = `/admin/procurement/${encodeURIComponent(input.purchaseOrderId)}`

  if (input.linkedOrderNumber && input.deliverableCount > 0 && (input.qcPending > 0 || input.qcFailed > 0)) {
    return {
      key: "createPartialDelivery",
      href: `/admin/requests/new?orderNumber=${encodeURIComponent(input.linkedOrderNumber)}&type=delivery`,
    }
  }

  if (input.qcPending > 0) return { key: "qcDevices", href: `${poHref}#quality-inspection` }
  if (input.qcFailed > 0) {
    return {
      key: "resolveQcIssues",
      href: input.failedAssetId
        ? `/admin/assets/${encodeURIComponent(input.failedAssetId)}`
        : `${poHref}#quality-inspection`,
    }
  }
  if (input.linkedOrderNumber) {
    return {
      key: "createDeliveryJob",
      href: `/admin/requests/new?orderNumber=${encodeURIComponent(input.linkedOrderNumber)}&type=delivery`,
    }
  }
  return { key: "reviewInventory", href: poHref }
}
