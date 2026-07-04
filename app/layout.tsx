import type { Metadata } from "next"
import { Geist, Geist_Mono, Cairo } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

  return (
    <html lang={locale} dir={dir}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} antialiased ${locale === "ar" ? "font-arabic" : ""}`}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} richColors closeButton />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
