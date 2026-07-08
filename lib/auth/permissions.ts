// ─── Authorization layer ────────────────────────────────────────────────────
// Central capability map so authorization is expressed as PERMISSIONS, not raw
// role string checks scattered across the code. Today permissions are derived
// purely from the role, but call sites depend only on `can(role, permission)` /
// `roleCan(...)` — so a future fine-grained RBAC (per-user overrides, custom
// roles, a permissions table) can be introduced by changing ONLY this file and
// the resolver, without touching every guard. This is the seam that keeps the
// door open for RBAC without rewriting auth.

export type Role = "admin" | "finance" | "viewer" | "partner"

export const ROLES: Role[] = ["admin", "finance", "viewer", "partner"]

// Staff roles can reach the /admin area; partner is portal-only.
export const STAFF_ROLES: Role[] = ["admin", "finance", "viewer"]

export type Permission =
  | "users.read"
  | "users.manage"
  | "settings.manage"
  | "settings.pricing.manage"
  | "payments.manage"
  | "requests.manage"
  | "requests.read"
  | "assets.manage"
  | "partners.manage"
  | "signatures.manage"
  | "reports.read"
  | "portal.access"

// Role → granted permissions. The single source of truth for what each role
// may do. Add a permission here, grant it to roles, and guard with can().
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "users.read",
    "users.manage",
    "settings.manage",
    "settings.pricing.manage",
    "payments.manage",
    "requests.manage",
    "requests.read",
    "assets.manage",
    "partners.manage",
    "signatures.manage",
    "reports.read",
  ],
  finance: [
    "settings.pricing.manage",
    "payments.manage",
    "requests.read",
    "reports.read",
  ],
  viewer: ["requests.read", "reports.read"],
  partner: ["portal.access"],
}

/** Does this role grant this permission? Pure — safe to use anywhere. */
export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/**
 * Resolve every permission for a role. When per-user overrides / custom roles
 * arrive, this resolver (and only this resolver) grows to merge them in.
 */
export function permissionsForRole(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])]
}
