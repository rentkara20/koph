import { z } from "zod"
import { digitsOnly, normalizeMobile } from "@/lib/utils/digits"

// Shared Zod schemas for server-action inputs. Server actions are public POST
// endpoints, so every untrusted input is validated here before any DB work.

const nonEmpty = (max = 500) => z.string().trim().min(1).max(max)

// Number fields arrive from phone keyboards that may be set to Arabic, which
// sends ٠١٢٣ rather than 0123. Fold before validating, so a genuine number
// typed on an Arabic keyboard is accepted rather than rejected as malformed,
// and so nothing but ASCII digits ever reaches the database.
const digitString = (max = 30) =>
  z.preprocess(
    (value) => (typeof value === "string" ? digitsOnly(value) : value),
    z.string().max(max)
  )
const mobileString = (max = 30) =>
  z.preprocess(
    (value) => (typeof value === "string" ? normalizeMobile(value) : value),
    z.string().max(max)
  )

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
  mobile: mobileString().optional(),
  nationalId: digitString().optional(),
  signatureData: signatureDataSchema,
  itemConditions: z.array(itemConditionSchema).max(200).optional(),
})

export const signOnSiteSchema = z.object({
  fullName: nonEmpty(200),
  // Saudi national ID / Iqama numbers are 10 digits; allow longer foreign IDs.
  nationalId: digitString().refine((value) => /^\d{10,30}$/.test(value), {
    message: "must be 10-30 digits",
  }),
  mobile: mobileString().optional(),
  signatureData: signatureDataSchema,
})

// Kara's own rep signing an agent-only receipt. Deliberately NOT signOnSiteSchema:
// the rep is an employee, not the customer, so there is no national ID to
// verify — demanding an Iqama would just block our own courier. The absence
// reason is mandatory instead: an agent-only receipt without a stated reason is
// exactly the unexplained one-sided signature this whole flow exists to end.
export const signAgentOnlySchema = z.object({
  fullName: nonEmpty(200),
  signatureData: signatureDataSchema,
  customerAbsenceReason: nonEmpty(500),
  mobile: mobileString().optional(),
  position: z.string().max(200).optional(),
})

export const partnerActionSchema = z.enum([
  "accept",
  "reject",
  "start",
  "mark_done",
  "mark_failed",
  // Supplier-pickup kind only (mark_picked_up goes through its own
  // quantity-carrying action in procurement-pickup.ts, not updateTaskByToken).
  "mark_arrived",
])

// Failure reasons are now DB-driven (lib/db/schema.ts failureReasons table,
// managed under Settings). This only checks shape — the action layer
// (updateTaskByToken) validates the slug exists and is active.
export const failureReasonSchema = z.string().min(1).max(50)

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
}).refine(
  // Mirrors the request_item_order_unit_qty_chk DB constraint: one serialized
  // order unit is exactly one physical device, so quantity>1 is meaningless
  // there and would make serial tracking on delivery ambiguous. Caught here so
  // the UI gets a readable message instead of a raw SQLITE_CONSTRAINT throw.
  (item) => !item.orderUnitId || item.quantity === 1,
  { message: "An item imported from an order must have quantity 1", path: ["quantity"] }
)

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name: nonEmpty(200),
  contactPerson: z.string().trim().max(200).optional(),
  mobile: z.string().trim().max(30).optional(),
  email: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  // Supplier-pickup logistics — inherited onto pickup tasks.
  pickupContactName: z.string().trim().max(200).optional(),
  pickupContactMobile: z.string().trim().max(30).optional(),
  pickupMapsUrl: z.string().trim().max(500).optional(),
  pickupNotes: z.string().trim().max(2000).optional(),
})

// ─── Orders ──────────────────────────────────────────────────────────────────

export const orderLineInputSchema = z.object({
  id: z.string().trim().max(60).optional(),
  // Per-line fulfilment type. rental_asset draws from the rental pool and must
  // return; sold_product draws from products-for-sale and ends as sold. A
  // single order freely mixes both. Defaults to rental_asset for back-compat.
  type: z.enum(["rental_asset", "sold_product"]).default("rental_asset"),
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
  status: z.enum(["receiving_qc", "in_stock", "reserved", "assigned", "delivered", "returned", "maintenance", "damaged", "supplier_return_pending", "supplier_returned", "retired", "sold", "lost"]).optional(),
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
  customerConfirmationDate: z.string().optional(),
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
  customerLocationId: z.string().trim().max(60).optional(),
  receiverContactId: z.string().trim().max(60).optional(),
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
  photoRequired: z.boolean().optional(),
  // Date-only (YYYY-MM-DD), resolved in Asia/Riyadh by the action layer.
  scheduledDate: z.string().trim().max(20).optional(),
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
