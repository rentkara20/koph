"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { AlertTriangle, Check, Copy, Loader2, Mail, MessageCircle, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Sheet } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { activateWarrantyForAssignments, requestWarrantyForAssets } from "@/lib/actions/warranty"
import { translateActionError } from "@/lib/i18n/action-errors"
import { warrantyRegistryStatusVariant as STATUS_VARIANT } from "@/lib/domain/status-variant"
import { buildWarrantyRequestMessages } from "@/lib/domain/warranty-request-message"
import type { WarrantyRequestMessageTemplates } from "@/lib/domain/message-templates"
import { buildWhatsappUrl } from "@/lib/utils/whatsapp"
import { cn } from "@/lib/utils"
import type { WarrantyRegistryRow } from "@/lib/actions/warranty"

type ProductOption = { id: string; nameEn: string }
type SupplierOption = { id: string; name: string; contactPerson: string | null; mobile: string | null; email: string | null }
type PoOption = { id: string; poNumber: string }
type SourceOption = "with_device" | "separate" | "other_supplier" | "bulk"

export function RegistryTable({
  rows,
  products,
  suppliers,
  purchaseOrders,
  messageTemplates,
}: {
  rows: (WarrantyRegistryRow & { purchaseDateLabel: string; endAtLabel: string })[]
  products: ProductOption[]
  suppliers: SupplierOption[]
  purchaseOrders: PoOption[]
  messageTemplates: WarrantyRequestMessageTemplates
}) {
  const t = useTranslations("warranty.registry")
  const tw = useTranslations("warranty")
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [activateStartAt, setActivateStartAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [activatePending, startActivateTransition] = useTransition()

  const [productId, setProductId] = useState(products[0]?.id ?? "")
  const [source, setSource] = useState<SourceOption>("bulk")
  const [supplierId, setSupplierId] = useState("")
  const [poId, setPoId] = useState("")
  const [draft, setDraft] = useState<{ whatsappBody: string; emailSubject: string; emailBody: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [query, setQuery] = useState("")
  const [brandFilter, setBrandFilter] = useState("")

  const brands = useMemo(
    () => [...new Set(rows.map((r) => r.brand).filter((b): b is string => !!b))].sort(),
    [rows]
  )

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (brandFilter && r.brand !== brandFilter) return false
      if (!q) return true
      const haystack = [r.serialNumber, r.assetTag, r.brand, r.model, r.description, r.supplierName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, query, brandFilter])

  // Selecting across brands is usually a mistake — one warranty type
  // (AppleCare+, Lenovo ADP, …) applies to one brand, so mixing brands in a
  // single request means the wrong product gets requested for some devices.
  const selectedBrands = useMemo(
    () => [...new Set(rows.filter((r) => selected.has(r.assetId)).map((r) => r.brand).filter(Boolean))],
    [rows, selected]
  )

  const selectableIds = useMemo(
    () => visibleRows.filter((r) => r.warrantyStatus === "none" || r.warrantyStatus === "pending").map((r) => r.assetId),
    [visibleRows]
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const supplier = suppliers.find((s) => s.id === supplierId)
  const requiresSupplier = source !== "with_device"

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.assetId)), [rows, selected])
  const selectedStatuses = useMemo(
    () => new Set(selectedRows.map((r) => r.warrantyStatus)),
    [selectedRows]
  )
  // A selection must be all "none" (request warranty) or all "pending"
  // (activate) — the two actions need different inputs and mean different
  // things, so mixing them is treated as a mistake rather than guessed at.
  const isMixedSelection = selectedStatuses.size > 1
  const isActivateSelection = selectedStatuses.has("pending") && !isMixedSelection
  const activateAssignmentIds = selectedRows
    .map((r) => r.assignmentId)
    .filter((id): id is string => !!id)

  function handleActivate() {
    if (activateAssignmentIds.length === 0) return
    startActivateTransition(async () => {
      const result = await activateWarrantyForAssignments({
        assignmentIds: activateAssignmentIds,
        startAtInput: activateStartAt,
      })
      if (result.failed.length > 0) {
        toast.error(t("activateFailedCount", { count: result.failed.length }))
      }
      if (result.activated > 0) {
        toast.success(t("activatedCount", { count: result.activated }))
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  function toggle(assetId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  function resetAndClose() {
    setOpen(false)
    setDraft(null)
    setSelected(new Set())
    setSupplierId("")
    setPoId("")
  }

  function handleSubmit() {
    if (!productId || selected.size === 0) return
    if (requiresSupplier && !supplierId) return
    const selectedRows = rows.filter((r) => selected.has(r.assetId))
    startTransition(async () => {
      const result = await requestWarrantyForAssets({
        assetIds: [...selected],
        warrantyProductId: productId,
        source,
        supplierId: supplierId || undefined,
        purchaseOrderId: poId || undefined,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }

      // "with_device" just links an already-requested warranty to the PO —
      // nothing to send. Everything else is a live request to a provider,
      // so surface the WhatsApp/email draft next (same pattern as RFQ).
      if (source === "with_device") {
        toast.success(t("requestSent", { count: selected.size }))
        resetAndClose()
        router.refresh()
        return
      }

      const batchRef = result.id?.slice(0, 8).toUpperCase() ?? ""
      const productName = products.find((p) => p.id === productId)?.nameEn ?? ""
      const messages = buildWarrantyRequestMessages(
        {
          supplierContactName: supplier?.contactPerson ?? null,
          warrantyProductName: productName,
          batchRef,
          items: selectedRows.map((r) => ({
            serial: r.serialNumber ?? r.assetTag,
            device: [r.brand, r.model].filter(Boolean).join(" · ") || r.description || "—",
          })),
        },
        messageTemplates
      )
      setDraft(messages)
      router.refresh()
    })
  }

  async function copyMessage() {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft.whatsappBody)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  const whatsappUrl = draft ? buildWhatsappUrl(supplier?.mobile, draft.whatsappBody) : null
  const mailtoUrl =
    draft && supplier?.email
      ? `mailto:${supplier.email}?subject=${encodeURIComponent(draft.emailSubject)}&body=${encodeURIComponent(draft.emailBody)}`
      : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="ps-9"
          />
        </div>
        <Select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="w-auto">
          <option value="">{t("allBrands")}</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>

      {selected.size > 0 && isMixedSelection && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {t("mixedSelectionWarning")}
        </div>
      )}

      {selected.size > 0 && !isMixedSelection && !isActivateSelection && (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <p className="text-sm font-medium">{t("selectedCount", { count: selected.size })}</p>
          <Button size="sm" onClick={() => setOpen(true)} disabled={products.length === 0}>
            {t("requestWarranty")}
          </Button>
        </div>
      )}

      {selected.size > 0 && isActivateSelection && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <p className="text-sm font-medium">{t("selectedCount", { count: selected.size })}</p>
          <div className="flex items-center gap-2">
            <Label className="text-xs">{t("startDate")}</Label>
            <Input
              type="date"
              value={activateStartAt}
              onChange={(e) => setActivateStartAt(e.target.value)}
              className="w-auto"
            />
            <Button size="sm" onClick={handleActivate} disabled={activatePending}>
              {activatePending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
              {t("activateWarranty")}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-3">
                {selectableIds.length > 0 && (
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                )}
              </th>
              <th className="p-3">{t("serial")}</th>
              <th className="p-3">{t("device")}</th>
              <th className="p-3">{t("supplier")}</th>
              <th className="p-3">{t("purchaseDate")}</th>
              <th className="p-3">{t("warrantyType")}</th>
              <th className="p-3">{t("warrantyProvider")}</th>
              <th className="p-3">{t("expiresOn")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.assetId} className="border-b last:border-0 align-top">
                <td className="p-3">
                  {(row.warrantyStatus === "none" || row.warrantyStatus === "pending") && (
                    <input
                      type="checkbox"
                      checked={selected.has(row.assetId)}
                      onChange={() => toggle(row.assetId)}
                    />
                  )}
                </td>
                <td className="p-3" dir="ltr">
                  {row.serialNumber ?? row.assetTag ?? "—"}
                </td>
                <td className="p-3">
                  <p>{[row.brand, row.model].filter(Boolean).join(" · ") || row.description || "—"}</p>
                </td>
                <td className="p-3">{row.supplierName ?? "—"}</td>
                <td className="p-3">{row.purchaseDateLabel}</td>
                <td className="p-3">{row.warrantyType ?? "—"}</td>
                <td className="p-3">{row.warrantyProvider ?? "—"}</td>
                <td className="p-3">{row.endAtLabel}</td>
                <td className="p-3">
                  <Badge variant={STATUS_VARIANT[row.warrantyStatus]}>{t(`statuses.${row.warrantyStatus}` as never)}</Badge>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                  {t("noAssets")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onClose={resetAndClose} side="end" title={t("requestWarranty")}>
        <div className="space-y-4 p-5 pt-14">
          {!draft ? (
            <>
              <p className="text-sm text-muted-foreground">{t("selectedCount", { count: selected.size })}</p>
              {selectedBrands.length > 1 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p>{t("mixedBrandsWarning", { brands: selectedBrands.join(", ") })}</p>
                </div>
              )}
              <div>
                <Label className="text-xs">{tw("product")}</Label>
                <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameEn}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">{tw("batch")}</Label>
                <Select value={source} onChange={(e) => setSource(e.target.value as SourceOption)}>
                  <option value="bulk">bulk</option>
                  <option value="with_device">with_device — {t("withDeviceHint")}</option>
                  <option value="separate">separate</option>
                  <option value="other_supplier">other_supplier</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  {tw("supplier")} {requiresSupplier && <span className="text-destructive">*</span>}
                </Label>
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">{requiresSupplier ? `— ${t("chooseSupplier")} —` : "— inherit from PO —"}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">PO</Label>
                <Select value={poId} onChange={(e) => setPoId(e.target.value)}>
                  <option value="">— no purchase order —</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.poNumber}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={pending || !productId || (requiresSupplier && !supplierId)}
                className="w-full"
              >
                {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
                {t("requestWarranty")}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{t("reviewMessage")}</p>
              <Textarea
                dir="auto"
                rows={11}
                value={draft.whatsappBody}
                onChange={(e) => setDraft({ ...draft, whatsappBody: e.target.value, emailBody: e.target.value })}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={copyMessage}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {t("copyMessage")}
                </Button>
                {mailtoUrl && (
                  <a href={mailtoUrl} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    <Mail className="size-4" /> {t("openEmailApp")}
                  </a>
                )}
                {whatsappUrl && (
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm" }))}>
                    <MessageCircle className="size-4" /> {t("openWhatsapp")}
                  </a>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={resetAndClose} className="w-full">
                {t("done")}
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </div>
  )
}
