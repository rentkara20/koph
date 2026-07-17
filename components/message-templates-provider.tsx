"use client"

import { createContext, useContext } from "react"
import {
  DEFAULT_OPERATIONAL_TEMPLATES,
  type OperationalMessageTemplates,
} from "@/lib/domain/message-templates"

const MessageTemplatesContext = createContext<OperationalMessageTemplates>(DEFAULT_OPERATIONAL_TEMPLATES)

export function MessageTemplatesProvider({
  templates,
  children,
}: {
  templates: OperationalMessageTemplates
  children: React.ReactNode
}) {
  return <MessageTemplatesContext.Provider value={templates}>{children}</MessageTemplatesContext.Provider>
}

export function useOperationalMessageTemplates() {
  return useContext(MessageTemplatesContext)
}
