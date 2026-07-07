import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getAllRequestTypes, createRequestType, updateRequestType, toggleRequestType, moveRequestType } from "@/lib/actions/request-types"
import { SYSTEM_REQUEST_TYPE_SLUGS } from "@/lib/domain/request-types"
import { getFailureReasons, createFailureReason, updateFailureReason, toggleFailureReason, moveFailureReason } from "@/lib/actions/failure-reasons"
import { readRequestTaskSettingsForAdmin } from "@/lib/actions/settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { NamedListManager } from "@/components/settings/named-list-manager"
import { GeneralSettingsForm } from "@/components/settings/general-settings-form"
import { cn } from "@/lib/utils"

export default async function RequestTaskSettingsPage() {
  const [requestTypes, failureReasons, generalSettings] = await Promise.all([
    getAllRequestTypes(),
    getFailureReasons(),
    readRequestTaskSettingsForAdmin(),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Request & Task Configuration</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Request types, task failure reasons, and workflow rules — no code change needed.
          </p>
        </div>
      </div>

      {generalSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">General</CardTitle>
          </CardHeader>
          <CardContent>
            <GeneralSettingsForm initial={generalSettings} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Request types
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NamedListManager
            items={requestTypes}
            actions={{
              create: createRequestType,
              update: updateRequestType,
              toggle: toggleRequestType,
              move: moveRequestType,
            }}
            emptyLabel="No request types yet."
            addLabel="Add request type"
            lockedSlugs={SYSTEM_REQUEST_TYPE_SLUGS}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Task failure reasons
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NamedListManager
            items={failureReasons}
            actions={{
              create: createFailureReason,
              update: updateFailureReason,
              toggle: toggleFailureReason,
              move: moveFailureReason,
            }}
            emptyLabel="No failure reasons yet."
            addLabel="Add failure reason"
          />
        </CardContent>
      </Card>
    </div>
  )
}
