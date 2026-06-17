import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import en from "./messages/en.json"
import ar from "./messages/ar.json"

export const locales = ["en", "ar"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "en"

// Static imports (not a computed dynamic import) so this module bundles cleanly
// into the Edge middleware runtime — a dynamic import with a template path
// generates a webpack context module that references __dirname, which Edge lacks.
const messages: Record<Locale, Record<string, unknown>> = { en, ar }

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = (cookieStore.get("lang")?.value ?? defaultLocale) as Locale
  const validLocale = locales.includes(locale) ? locale : defaultLocale

  return {
    locale: validLocale,
    messages: messages[validLocale],
  }
})
