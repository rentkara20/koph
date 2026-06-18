"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { UserCheck, ChevronDown, ExternalLink, X } from "lucide-react"
import { setRequestReceiver } from "@/lib/actions/requests"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Contact = {
  id: string
  name: string
  role: string | null
  mobile: string | null
  email: string | null
}

type Props = {
  requestId: string
  customerId: string
  contacts: Contact[]
  receiverContactId: string | null
}

export function ReceiverSection({ requestId, customerId, contacts, receiverContactId }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const current = contacts.find((c) => c.id === receiverContactId) ?? null

  function select(contactId: string | null) {
    startTransition(async () => {
      await setRequestReceiver(requestId, contactId)
      router.refresh()
    })
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        {current ? (
          <div className="text-sm">
            <p className="font-medium">{current.name}</p>
            {current.role && <p className="text-muted-foreground text-xs">{current.role}</p>}
            {current.mobile && <p className="text-muted-foreground text-xs">{current.mobile}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No receiver selected</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {current && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={() => select(null)}
            title="Clear receiver"
          >
            <X className="size-3.5" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger disabled={pending} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50">
            <UserCheck className="size-3.5 mr-0.5" />
            {current ? "Change" : "Select"}
            <ChevronDown className="size-3.5 ml-0.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {contacts.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No employees added yet
              </div>
            ) : (
              contacts.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={() => select(c.id)}
                  className="flex flex-col items-start gap-0"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.role && <span className="text-xs text-muted-foreground">{c.role}</span>}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link
                href={`/admin/customers/${customerId}`}
                className="flex items-center gap-2 text-xs text-muted-foreground w-full"
              >
                <ExternalLink className="size-3.5" />
                Manage employees
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
