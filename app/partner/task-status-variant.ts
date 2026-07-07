export const TASK_STATUS_VARIANT: Record<
  string,
  "outline" | "info" | "warning" | "success" | "secondary" | "destructive"
> = {
  draft: "outline",
  sent: "info",
  accepted: "info",
  in_progress: "warning",
  pending_signoff: "warning",
  done: "success",
  failed: "destructive",
  rejected: "secondary",
  cancelled: "secondary",
}
