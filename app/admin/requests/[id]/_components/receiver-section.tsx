"use client"

import { useState, useTransition } from "react"
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
  const current = contacts.find((c) => c.id === receiverContactId) ?? null

  function select(contactId: string | null) {
    startTransition(async () => {
      await setRequestReceiver(requestId, contactId)
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
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              <UserCheck className="size-3.5 mr-1.5" />
              {current ? "Change" : "Select"}
              <ChevronDown className="size-3.5 ml-1" />
            </Button>
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
            <DropdownMenuItem asChild>
              <Link
                href={`/admin/customers/${customerId}`}
                className="flex items-center gap-2 text-xs text-muted-foreground"
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
