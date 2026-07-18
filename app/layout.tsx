import type { Metadata } from "next"
import { Geist, Geist_Mono, Cairo, Poppins, Outfit, Plus_Jakarta_Sans } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { Toaster } from "@/components/ui/sonner"
import { getEnglishFontFamily } from "@/lib/actions/settings"
import type { EnglishFontFamily } from "@/lib/domain/fonts"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  fallback: ["Inter", "system-ui", "sans-serif"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// KARA brand Arabic typeface — Cairo. Applied on the <body> for Arabic locale
// so Arabic text stops rendering in a Latin-first fallback face.
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
})

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
})

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
})

const ENGLISH_FONT_VAR: Record<EnglishFontFamily, string> = {
  geist: "var(--font-geist-sans)",
  poppins: "var(--font-poppins)",
  outfit: "var(--font-outfit)",
  plusJakartaSans: "var(--font-plus-jakarta-sans)",
}

export const metadata: Metadata = {
  title: "KOPH — Kara Operations & Partner Hub",
  description: "Operations management platform for Rent Kara",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const dir = locale === "ar" ? "rtl" : "ltr"
  const englishFontFamily = await getEnglishFontFamily()

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} ${poppins.variable} ${outfit.variable} ${plusJakartaSans.variable}`}
      style={
        locale === "ar"
          ? undefined
          : ({ "--font-family-sans": ENGLISH_FONT_VAR[englishFontFamily] } as React.CSSProperties)
      }
    >
      <body className={`antialiased ${locale === "ar" ? "font-arabic" : ""}`}>
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} richColors closeButton />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
