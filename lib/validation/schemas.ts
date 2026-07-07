import { z } from "zod"

// Shared Zod schemas for server-action inputs. Server actions are public POST
// endpoints, so every untrusted input is validated here before any DB work.

const nonEmpty = (max = 500) => z.string().trim().min(1).max(max)

// A signature is a base64 data URL from a canvas. Cap the size to reject
// oversized/garbage payloads (~2MB of base64).
// Raster-only (png/jpeg/webp) base64 — rejects SVG and other subtypes that
// could carry script when re-rendered by PDF/export tooling.
const SIGNATURE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export const signatureDataSchema = z
  .string()
  .min(1, "Signature is required")
  .max(2_800_000, "Signature image is too large")
  .refine((v) => SIGNATURE_DATA_URL.test(v), "Invalid signature format")

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
  // Set when the item was pulled from an order unit (device instance).
  orderUnitId: z.string().trim().max(60).optional(),
})

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name: nonEmpty(200),
  contactPerson: z.string().trim().max(200).optional(),
  mobile: z.string().trim().max(30).optional(),
  email: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
})

// ─── Orders ──────────────────────────────────────────────────────────────────

export const orderLineInputSchema = z.object({
  id: z.string().trim().max(60).optional(),
  description: nonEmpty(300),
  brand: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  quantity: z.number().int().min(1).max(100000),
  rentalMonths: z.number().int().min(0).max(600).optional(),
  unitPriceMonthly: z.number().min(0).max(100_000_000).optional(),
  notes: z.string().trim().max(1000).optional(),
})

export const orderUnitInputSchema = z.object({
  id: z.string().trim().max(60).optional(),
  orderLineId: nonEmpty(60),
  serialNumber: z.string().trim().max(120).optional(),
  supplierId: z.string().trim().max(60).optional(),
  purchaseCost: z.number().min(0).max(100_000_000).optional(),
  status: z.enum(["in_stock", "reserved", "assigned", "delivered", "returned", "maintenance", "damaged", "retired", "sold", "lost"]).optional(),
  notes: z.string().trim().max(1000).optional(),
})

export const orderStatusSchema = z.enum([
  "draft",
  "confirmed",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
])

export const createOrderSchema = z.object({
  orderNumber: nonEmpty(120),
  customerId: nonEmpty(60),
  contactPerson: z.string().trim().max(200).optional(),
  contactMobile: z.string().trim().max(30).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  quoteDate: z.string().optional(),
  rentalPeriodMonths: z.number().int().min(0).max(600).optional(),
  additionalPeriodMonths: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(orderLineInputSchema).max(500),
})

// Status is derived server-side from unit fulfillment (see deriveOrderStatus),
// not set by the edit form — accepted here only for the manual cancel/reopen action.
export const updateOrderSchema = createOrderSchema.extend({
  status: orderStatusSchema.optional(),
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
