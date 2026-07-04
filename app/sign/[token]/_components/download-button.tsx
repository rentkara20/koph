"use client"

import { useTranslations } from "next-intl"
import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DownloadButton({ token }: { token: string }) {
  const t = useTranslations("common")

  function openPrint(autoPrint: boolean) {
    const w = window.open(`/sign/${token}/print`, "_blank")
    if (autoPrint) w?.addEventListener("load", () => w.print())
  }

  return (
    <div className="flex w-full gap-2.5">
      <Button
        size="lg"
        className="flex-1 bg-kara-purple hover:bg-kara-purple/90"
        onClick={() => openPrint(false)}
      >
        <Download className="size-4" aria-hidden />
        {t("export")}
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="border-kara-purple text-kara-purple hover:bg-kara-purple-soft"
        onClick={() => openPrint(true)}
        aria-label="Print"
      >
        <Printer className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
