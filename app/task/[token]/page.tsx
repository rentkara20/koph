import { notFound } from "next/navigation"
import { getTaskByToken } from "@/lib/actions/tasks"
import { formatDate } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { TaskActions } from "./_components/task-actions"
import { Building2 } from "lucide-react"

const TASK_STATUS_VARIANT: Record<string, "outline" | "info" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "outline",
  accepted: "info",
  in_progress: "warning",
  pending_signoff: "warning",
  closed: "success",
  rejected: "destructive",
  failed: "destructive",
  cancelled: "secondary",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending acceptance",
  accepted: "Accepted",
  in_progress: "In progress",
  pending_signoff: "Awaiting sign-off",
  closed: "Closed",
  rejected: "Rejected",
  failed: "Failed",
  cancelled: "Cancelled",
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getTaskByToken(token)

  if (!data) notFound()

  const { task, request, customer, requestType, items, isExpired } = data

  const isTerminal = ["closed", "rejected", "failed", "cancelled"].includes(task.status)
  const canAct = !isTerminal && !isExpired

  return (
    <div className="min-h-svh bg-muted/30">
      {/* Header */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="flex items-center gap-2.5 px-4 py-3 max-w-lg mx-auto">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
            <Building2 className="h-4 w-4 text-background" />
          </div>
          <span className="font-semibold text-sm">KOPH</span>
          <span className="text-muted-foreground text-sm mx-1">·</span>
          <span className="font-mono text-sm text-muted-foreground">{request.requestNumber}</span>
          <Badge variant={TASK_STATUS_VARIANT[task.status] ?? "outline"} className="ml-auto">
            {STATUS_LABEL[task.status] ?? task.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Expired / terminal banners */}
        {isExpired && !isTerminal && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            This task link has expired. Contact the operations team to get a new link.
          </div>
        )}
        {task.status === "closed" && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            ✓ Task completed and signed off.
          </div>
        )}
        {task.status === "pending_signoff" && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            Task submitted. Waiting for the operations team to sign off.
          </div>
        )}
        {task.status === "rejected" && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">
            You rejected this task.
          </div>
        )}
        {task.status === "cancelled" && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">
            This task has been cancelled by the operations team.
          </div>
        )}
        {task.status === "failed" && task.failureReason && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            Task marked as failed: {task.failureReason.replace(/_/g, " ")}
            {task.failureNotes ? `. ${task.failureNotes}` : ""}
          </div>
        )}

        {/* Request info card */}
        <div className="rounded-xl bg-background border p-4 space-y-3">
          <h2 className="font-semibold">{requestType?.nameEn ?? "Task"}</h2>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium">{customer?.name ?? "—"}</p>
            </div>
            {customer?.city && (
              <div>
                <p className="text-xs text-muted-foreground">City</p>
                <p className="font-medium">{customer.city}</p>
              </div>
            )}
            {customer?.address && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="font-medium">{customer.address}</p>
                {customer.mapsLink && (
                  <a
                    href={customer.mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    View on map
                  </a>
                )}
              </div>
            )}
            {request.deliveryDate && (
              <div>
                <p className="text-xs text-muted-foreground">Delivery date</p>
                <p className="font-medium">{formatDate(request.deliveryDate)}</p>
              </div>
            )}
            {request.timeWindow && (
              <div>
                <p className="text-xs text-muted-foreground">Time window</p>
                <p className="font-medium">{request.timeWindow}</p>
              </div>
            )}
          </div>

          {task.notes && (
            <div className="pt-1 border-t text-sm">
              <p className="text-xs text-muted-foreground mb-1">Notes from ops</p>
              <p>{task.notes}</p>
            </div>
          )}
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="rounded-xl bg-background border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/50">
              <p className="text-sm font-medium">Items ({items.length})</p>
            </div>
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.description}</p>
                      {(item.brand || item.model) && (
                        <p className="text-xs text-muted-foreground">
                          {[item.brand, item.model].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {item.serialNumber && (
                        <p className="text-xs font-mono text-muted-foreground">S/N: {item.serialNumber}</p>
                      )}
                      {item.accessories && (
                        <p className="text-xs text-muted-foreground">+{item.accessories}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-medium bg-muted rounded-md px-2 py-0.5">
                      ×{item.quantity}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action buttons */}
        {canAct && <TaskActions token={token} status={task.status} />}
      </div>
    </div>
  )
}
