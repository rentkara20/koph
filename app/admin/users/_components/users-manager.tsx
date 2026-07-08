"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Search, Copy, Check } from "lucide-react"
import {
  createUser,
  resendInvite,
  setUserRole,
  setUserActive,
  revokeUserSessions,
  type UserListItem,
} from "@/lib/actions/users"
import { ROLES } from "@/lib/auth/permissions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils/format"
import { translateActionError } from "@/lib/i18n/action-errors"

type Partner = { id: string; name: string }

export function UsersManager({
  initialUsers,
  unlinkedPartners,
  currentUserId,
}: {
  initialUsers: UserListItem[]
  unlinkedPartners: Partner[]
  currentUserId: string
}) {
  const t = useTranslations("users")
  const tCommon = useTranslations("common")
  const router = useRouter()

  const [roleFilter, setRoleFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Create form
  const [cName, setCName] = useState("")
  const [cEmail, setCEmail] = useState("")
  const [cRole, setCRole] = useState<string>("viewer")
  const [cPartnerId, setCPartnerId] = useState("")

  function buildLink(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `${origin}/invite/${token}`
  }

  async function run(key: string, fn: () => Promise<{ error?: string; inviteToken?: string }>, successMsg?: string) {
    setBusy(key)
    try {
      const result = await fn()
      if (result.error) {
        toast.error(translateActionError(result.error))
      } else {
        if (result.inviteToken) {
          setInviteLink(buildLink(result.inviteToken))
          setCopied(false)
        }
        if (successMsg) toast.success(successMsg)
        router.refresh()
      }
      return result
    } catch {
      toast.error(t("saved"))
      return { error: "unknown" }
    } finally {
      setBusy(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const result = await run(
      "create",
      () => createUser({ name: cName, email: cEmail, role: cRole, partnerId: cPartnerId || undefined }),
      t("inviteSent")
    )
    if (!result.error) {
      setCName("")
      setCEmail("")
      setCRole("viewer")
      setCPartnerId("")
      setShowCreate(false)
    }
  }

  async function copyLink() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success(t("copied"))
    } catch {
      // clipboard blocked — leave the link visible for manual copy
    }
  }

  const users = initialUsers.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false
    if (statusFilter === "active" && (u.isDisabled || !u.hasLogin)) return false
    if (statusFilter === "disabled" && !u.isDisabled) return false
    if (statusFilter === "pending" && (u.hasLogin || u.isDisabled)) return false
    const q = search.trim().toLowerCase()
    if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
    return true
  })

  function statusBadge(u: UserListItem) {
    if (u.isDisabled) return <Badge variant="secondary">{t("disabled")}</Badge>
    if (!u.hasLogin) return <Badge variant="warning">{t("pending")}</Badge>
    return <Badge variant="success">{t("active")}</Badge>
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} className="ps-8" />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full sm:w-40">
          <option value="">{t("allRoles")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{t(`roles.${r}`)}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-40">
          <option value="">{t("allStatuses")}</option>
          <option value="active">{t("active")}</option>
          <option value="disabled">{t("disabled")}</option>
          <option value="pending">{t("pending")}</option>
        </Select>
        <Button onClick={() => setShowCreate((v) => !v)} className="sm:ms-auto">{t("new")}</Button>
      </div>

      {/* Invite link reveal */}
      {inviteLink && (
        <div className="rounded-lg border border-kara-purple/40 bg-kara-purple/5 p-4 space-y-2">
          <p className="text-sm font-medium">{t("inviteCreated")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs" dir="ltr">{inviteLink}</code>
            <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? t("copied") : t("copyLink")}
            </Button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">{t("new")}</p>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("name")}</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} required minLength={2} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("email")}</Label>
              <Input type="email" dir="ltr" value={cEmail} onChange={(e) => setCEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("role")}</Label>
              <Select value={cRole} onChange={(e) => setCRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{t(`roles.${r}`)}</option>
                ))}
              </Select>
            </div>
            {cRole === "partner" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("selectPartner")}</Label>
                <Select value={cPartnerId} onChange={(e) => setCPartnerId(e.target.value)} required>
                  <option value="">—</option>
                  {unlinkedPartners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">{t("selectPartnerHint")}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>{tCommon("cancel")}</Button>
            <Button type="submit" size="sm" disabled={busy === "create"}>
              {busy === "create" ? t("creating") : t("create")}
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {t("noResults")}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-2 lg:hidden">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">{u.email}</p>
                    {u.partnerName && <p className="text-xs text-muted-foreground truncate">{u.partnerName}</p>}
                  </div>
                  {statusBadge(u)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("lastLogin")}: {u.lastLoginAt ? formatDate(u.lastLoginAt) : t("never")}
                </div>
                <RowActions u={u} t={t} busy={busy} currentUserId={currentUserId} run={run} />
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden rounded-lg border overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("name")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("role")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("status")}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t("lastLogin")}</th>
                  <th className="px-4 py-2.5 text-end font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{u.email}</p>
                      {u.partnerName && <p className="text-xs text-muted-foreground">{u.partnerName}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelect u={u} t={t} busy={busy} currentUserId={currentUserId} run={run} />
                    </td>
                    <td className="px-4 py-3">{statusBadge(u)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : t("never")}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions u={u} t={t} busy={busy} currentUserId={currentUserId} run={run} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

type RunFn = (
  key: string,
  fn: () => Promise<{ error?: string; inviteToken?: string }>,
  successMsg?: string
) => Promise<{ error?: string; inviteToken?: string }>

function RoleSelect({
  u,
  t,
  busy,
  currentUserId,
  run,
}: {
  u: UserListItem
  t: ReturnType<typeof useTranslations>
  busy: string | null
  currentUserId: string
  run: RunFn
}) {
  const selfAdmin = u.id === currentUserId
  return (
    <Select
      value={u.role}
      disabled={busy !== null || selfAdmin}
      onChange={(e) => run(`role-${u.id}`, () => setUserRole(u.id, e.target.value), t("saved"))}
      className="h-8 w-32 text-xs"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>{t(`roles.${r}`)}</option>
      ))}
    </Select>
  )
}

function RowActions({
  u,
  t,
  busy,
  currentUserId,
  run,
  compact,
}: {
  u: UserListItem
  t: ReturnType<typeof useTranslations>
  busy: string | null
  currentUserId: string
  run: RunFn
  compact?: boolean
}) {
  const isSelf = u.id === currentUserId
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "justify-end" : ""}`}>
      {!compact && (
        <div className="w-full">
          <RoleSelect u={u} t={t} busy={busy} currentUserId={currentUserId} run={run} />
        </div>
      )}
      {!u.isDisabled && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => run(`invite-${u.id}`, () => resendInvite(u.id), t("inviteSent"))}
        >
          {u.hasLogin ? t("resetPassword") : t("resendInvite")}
        </Button>
      )}
      {u.hasLogin && !u.isDisabled && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => run(`revoke-${u.id}`, () => revokeUserSessions(u.id), t("sessionsRevoked"))}
        >
          {t("revokeSessions")}
        </Button>
      )}
      {!isSelf &&
        (u.isDisabled ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => {
              if (confirm(t("confirmActivate"))) run(`active-${u.id}`, () => setUserActive(u.id, true), t("saved"))
            }}
          >
            {t("activate")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy !== null}
            onClick={() => {
              if (confirm(t("confirmDeactivate"))) run(`active-${u.id}`, () => setUserActive(u.id, false), t("saved"))
            }}
          >
            {t("deactivate")}
          </Button>
        ))}
    </div>
  )
}
