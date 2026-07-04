import { z } from "zod"

// Shared Zod schemas for server-action inputs. Server actions are public POST
// endpoints, so every untrusted input is validated here before any DB work.

const nonEmpty = (max = 500) => z.string().trim().min(1).max(max)

// A signature is a base64 data URL from a canvas. Cap the size to reject
// oversized/garbage payloads (~2MB of base64).
export const signatureDataSchema = z
  .string()
  .min(1, "Signature is required")
  .max(2_800_000, "Signature image is too large")
  .refine((v) => v.startsWith("data:image/"), "Invalid signature format")

export const itemConditionSchema = z.object({
  requestItemId: nonEmpty(60),
  condition: z.enum(["good", "damaged", "missing"]),
  receivedQuantity: z.number().int().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
})

export const submitSignatureSchema = z.object({
  fullName: nonEmpty(200),
  mobile: z.string().trim().max(30).optional(),
  nationalId: z.string().trim().max(30).optional(),
  signatureData: signatureDataSchema,
  itemConditions: z.array(itemConditionSchema).max(200).optional(),
})

export const signOnSiteSchema = z.object({
  fullName: nonEmpty(200),
  nationalId: nonEmpty(30),
  signatureData: signatureDataSchema,
})

export const partnerActionSchema = z.enum([
  "accept",
  "reject",
  "start",
  "mark_done",
  "mark_failed",
])

export const failureReasonSchema = z.enum([
  "customer_unavailable",
  "wrong_address",
  "item_damaged",
  "access_denied",
  "customer_rescheduled",
  "other",
])

const pricingModelSchema = z.enum(["per_order", "per_item", "per_day", "per_hour", "fixed"])

export const itemInputSchema = z.object({
  description: nonEmpty(300),
  brand: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  quantity: z.number().int().min(1).max(100000),
  accessories: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
})

export const createRequestSchema = z.object({
  typeId: nonEmpty(60),
  customerId: nonEmpty(60),
  quoteNumber: z.string().trim().max(120).optional(),
  salesRef: z.string().trim().max(120).optional(),
  poNumber: z.string().trim().max(120).optional(),
  deliveryDate: z.string().optional(),
  collectionDate: z.string().optional(),
  timeWindow: z.string().trim().max(120).optional(),
  requireNationalId: z.boolean(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(itemInputSchema).max(500),
})

export const createTaskSchema = z.object({
  partnerId: nonEmpty(60),
  contractId: z.string().trim().max(60).optional(),
  contactId: z.string().trim().max(60).optional(),
  taskTypeId: z.string().trim().max(60).optional(),
  executionMode: z.enum(["manual", "api_courier"]).optional(),
  notes: z.string().trim().max(1000).optional(),
})

export const createSignatureRequestSchema = z.object({
  documentName: nonEmpty(200),
  requireNationalId: z.boolean().optional(),
})

export const periodSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format")

export const pricingModel = pricingModelSchema

// Formats a ZodError into a single friendly message for the action envelope.
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input"
}
