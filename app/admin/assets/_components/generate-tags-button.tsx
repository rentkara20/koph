"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { generateMissingAssetTags } from "@/lib/actions/assets"
import { translateActionError } from "@/lib/i18n/action-errors"

export function GenerateTagsButton() {
  const t = useTranslations("assets")
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const result = await generateMissingAssetTags()
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    toast.success(t("tagsGenerated", { count: result.tagged ?? 0 }))
    router.refresh()
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading} className="gap-1.5">
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Tags className="size-4" aria-hidden />
      )}
      {t("generateTags")}
    </Button>
  )
}
