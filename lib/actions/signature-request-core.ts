// The ONE birth function for a signature request.
//
// Before this existed there were four insert sites: the admin path, the
// stage-2 authorised-signoff path, and two near-identical auto-create blocks in
// the on-site signing flows. They disagreed — the on-site blocks forced
// requireNationalId = true and were born `sent` instead of `draft`, and the
// stage-2 path inserted no verificationId at all (later back-filled lazily by
// whichever reader noticed). Four paths, three behaviours, one entity.
//
// That divergence is exactly why the channel dimension needed this file first:
// a `channel` column set by four different call sites would have been
// inconsistent from its first day. Now the channel arrives as an argument and
// its policy is resolved in one place.
//
// Rule (constitution §15): a channel is a delivery dimension, never a code
// path. If a new channel needs its own creation function, the abstraction is
// wrong.
import type { db } from "@/lib/db"
import { signatureRequests } from "@/lib/db/schema"
import { createId, generateSecureToken, generateVerificationId } from "@/lib/utils/ids"
import {
  resolveSignaturePolicy,
  signatureExpiresAt,
  type SignatureChannel,
  type SignaturePolicyOverrides,
} from "@/lib/domain/signature-channel"
import type { SignatoryRole } from "@/lib/domain/signature-stage"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DbLike = typeof db | Tx

export type CreateSignatureRequestCoreInput = {
  channel: SignatureChannel
  customerId: string
  documentName: string
  requestId?: string | null
  partnerTaskId?: string | null
  initiatedBy: "admin" | "partner" | "system"
  /** Staff user who initiated. Null for partner-initiated requests. */
  initiatorId?: string | null
  /** Partner who initiated, when initiatedBy = "partner". */
  createdByAgentId?: string | null
  signatoryRole?: SignatoryRole
  parentSignatureRequestId?: string | null
  signatoryContactId?: string | null
  /** JSON-encoded DepositNote, already validated by the caller. */
  depositNote?: string | null
  /**
   * Born `draft` (admin composes, then sends) or `sent` (the link is live
   * immediately, which is what every field flow needs).
   */
  status?: "draft" | "sent"
  /**
   * Per-request escape hatch over the channel policy. Only explicitly passed
   * fields override; `undefined` never does, so toggling one flag cannot
   * silently reset the rest.
   */
  policyOverrides?: SignaturePolicyOverrides | null
  /** Stored channel policies from app_setting; omit to use system defaults. */
  storedPolicies?: Parameters<typeof resolveSignaturePolicy>[1]
  now?: number
}

export type CreatedSignatureRequest = {
  id: string
  token: string
  verificationId: string
}

export async function createSignatureRequestCore(
  dbOrTx: DbLike,
  input: CreateSignatureRequestCoreInput
): Promise<CreatedSignatureRequest> {
  const now = input.now ?? Date.now()
  const policy = resolveSignaturePolicy(input.channel, input.storedPolicies, input.policyOverrides)

  const id = createId()
  const token = generateSecureToken()
  // Always minted here. The stage-2 path used to omit it, which left the public
  // /verify/[id] proof page unreachable for that request until some later read
  // happened to back-fill it.
  const verificationId = generateVerificationId()
  const status = input.status ?? "draft"

  await dbOrTx.insert(signatureRequests).values({
    id,
    channel: input.channel,
    requestId: input.requestId ?? null,
    partnerTaskId: input.partnerTaskId ?? null,
    initiatedBy: input.initiatedBy,
    initiatorId: input.initiatorId ?? null,
    createdByAgentId: input.createdByAgentId ?? null,
    customerId: input.customerId,
    signatoryRole: input.signatoryRole ?? "receiver",
    parentSignatureRequestId: input.parentSignatureRequestId ?? null,
    signatoryContactId: input.signatoryContactId ?? null,
    documentName: input.documentName.trim(),
    secureToken: token,
    verificationId,
    requireNationalId: policy.requireNationalId,
    otpEnabled: policy.otpEnabled,
    expiryEnabled: policy.expiryEnabled,
    expiresAt: signatureExpiresAt(policy, now),
    reminderEnabled: policy.reminderEnabled,
    depositNote: input.depositNote ?? null,
    status,
    // agent_device dispatches nothing — the courier opens the page on the
    // device already in their hand — so sentAt stays null there even though
    // the request is born `sent`.
    sentAt: status === "sent" && input.channel !== "agent_device" ? now : null,
    createdAt: now,
    updatedAt: now,
  })

  return { id, token, verificationId }
}
