export const ASSET_STATUS_VARIANT: Record<
  string,
  "outline" | "info" | "warning" | "success" | "secondary" | "destructive"
> = {
  in_stock: "success",
  reserved: "info",
  assigned: "info",
  delivered: "warning",
  returned: "outline",
  maintenance: "warning",
  damaged: "destructive",
  supplier_return_pending: "warning",
  supplier_returned: "secondary",
  retired: "secondary",
  sold: "secondary",
  lost: "destructive",
}
