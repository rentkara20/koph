import { sql } from "drizzle-orm"
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

// ─── Helpers ────────────────────────────────────────────────────────────────

const now = () => Date.now()

// ─── Better Auth core tables ────────────────────────────────────────────────

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  // KOPH additions
  role: text("role", { enum: ["admin", "finance", "viewer", "partner"] })
    .notNull()
    .default("viewer"),
  lang: text("lang", { enum: ["en", "ar"] }).notNull().default("en"),
  // Deactivation flag (distinct from deletedAt): a disabled user is blocked
  // from signing in but is not deleted. Enforced in lib/auth/session.ts.
  disabledAt: integer("disabled_at"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
  deletedAt: integer("deleted_at"),
})

// ─── User invites (generalized onboarding for every role) ───────────────────
// Superset of the partner activation-token pattern. Admin creates a user row
// (no credential account yet), an invite is generated; the user opens
// /invite/[token], sets their own password (creates the credential account),
// and the account becomes usable. Works for admin/finance/viewer/partner.

export const userInvites = sqliteTable("user_invite", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  acceptedAt: integer("accepted_at"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
})

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at"),
  updatedAt: integer("updated_at"),
})

// ─── Request types (config-driven) ─────────────────────────────────────────

export const requestTypes = sqliteTable("request_type", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // Proof requirements for tasks of this type, as JSON ProofConfig
  // ({ signature?: boolean, photos?: number }). Null = defer to system default.
  // Resolved by lib/domain/proof.ts (see OI-0 / Master Roadmap Phase 1).
  proofConfig: text("proof_config"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

// ─── Customers ──────────────────────────────────────────────────────────────

export const customers = sqliteTable("customer", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  mobile: text("mobile"),
  email: text("email"),
  city: text("city"),
  address: text("address"),
  mapsLink: text("maps_link"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
  deletedAt: integer("deleted_at"),
})

// ─── Customer operational locations ────────────────────────────────────────
// A customer can have several reusable delivery/pickup sites. People are kept
// separate and linked through customer_contact_location because one employee
// may work at several sites.

export const customerLocations = sqliteTable("customer_location", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["office", "warehouse", "branch", "project_site", "other"] })
    .notNull()
    .default("office"),
  city: text("city"),
  address: text("address"),
  mapsLink: text("maps_link"),
  googlePlaceId: text("google_place_id"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  workingHours: text("working_hours"),
  accessNotes: text("access_notes"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [
  index("customer_location_customer_idx").on(t.customerId),
  uniqueIndex("customer_location_single_default_idx")
    .on(t.customerId, t.isDefault)
    .where(sql`${t.isDefault} = 1`),
])

// ─── Customer contacts (branches / receiving employees) ─────────────────────

export const customerContacts = sqliteTable("customer_contact", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  mobile: text("mobile"),
  email: text("email"),
  city: text("city"),
  address: text("address"),
  mapsLink: text("maps_link"),
  notes: text("notes"),
  // Whether this contact is legally authorised to sign delivery notes.
  // A receiver who is not authorised triggers a second signing stage.
  isAuthorizedSignatory: integer("is_authorized_signatory", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [index("customer_contact_customer_idx").on(t.customerId)])

export const customerContactLocations = sqliteTable("customer_contact_location", {
  contactId: text("contact_id")
    .notNull()
    .references(() => customerContacts.id, { onDelete: "cascade" }),
  locationId: text("location_id")
    .notNull()
    .references(() => customerLocations.id, { onDelete: "cascade" }),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [
  uniqueIndex("customer_contact_location_unique_idx").on(t.contactId, t.locationId),
  index("customer_contact_location_location_idx").on(t.locationId),
])

// ─── Requests ───────────────────────────────────────────────────────────────

export const requests = sqliteTable("request", {
  id: text("id").primaryKey(),
  requestNumber: text("request_number").notNull().unique(),
  trackingCode: text("tracking_code").notNull().unique(),
  typeId: text("type_id")
    .notNull()
    .references(() => requestTypes.id),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  quoteNumber: text("quote_number"),
  // Delivery sequence within the same customer order: P1, P2, ...
  deliveryPartNumber: integer("delivery_part_number"),
  salesRef: text("sales_ref"),
  poNumber: text("po_number"),
  deliveryDate: integer("delivery_date"),
  collectionDate: integer("collection_date"),
  timeWindow: text("time_window"),
  status: text("status", {
    enum: [
      "draft",
      "assigned",
      "in_progress",
      "completed",
      "failed",
      "on_hold",
      "cancelled",
      "rescheduled",
    ],
  })
    .notNull()
    .default("draft"),
  // Pre-fill default for signature requests created from this request
  requireNationalId: integer("require_national_id", { mode: "boolean" })
    .notNull()
    .default(false),
  receiverContactId: text("receiver_contact_id").references(() => customerContacts.id, { onDelete: "set null" }),
  customerLocationId: text("customer_location_id").references(() => customerLocations.id, { onDelete: "set null" }),
  // Immutable site snapshot for historical tasks. Renaming a customer site
  // later must not rewrite where an existing courier was instructed to go.
  locationNameSnapshot: text("location_name_snapshot"),
  locationAddressSnapshot: text("location_address_snapshot"),
  locationMapsLinkSnapshot: text("location_maps_link_snapshot"),
  locationLatitudeSnapshot: real("location_latitude_snapshot"),
  locationLongitudeSnapshot: real("location_longitude_snapshot"),
  // Logistics — where the courier picks up and where it is delivered
  origin: text("origin"),
  destination: text("destination"),
  // Agreed slot (proposed over WhatsApp in v1, stored free-form epoch when confirmed)
  scheduledAt: integer("scheduled_at"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
  deletedAt: integer("deleted_at"),
}, (t) => [
  index("request_customer_idx").on(t.customerId),
  index("request_status_idx").on(t.status),
  uniqueIndex("request_order_delivery_part_unique_idx")
    .on(t.quoteNumber, t.deliveryPartNumber)
    .where(sql`${t.quoteNumber} IS NOT NULL AND ${t.deliveryPartNumber} IS NOT NULL`),
])

// ─── Request items ──────────────────────────────────────────────────────────

export const requestItems = sqliteTable("request_item", {
  id: text("id").primaryKey(),
  requestId: text("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  quantity: integer("quantity").notNull().default(1),
  accessories: text("accessories"),
  notes: text("notes"),
  // When this item was pulled from an order, links to the physical device unit.
  // Kept as set-null so deleting an order/unit never destroys request history.
  orderUnitId: text("order_unit_id").references(() => orderUnits.id, {
    onDelete: "set null",
  }),
  // Admin-approved cumulative delivered quantity across all delivery tasks for
  // this item. Only incremented at final admin signOffTask, guarded to never
  // exceed quantity. Independent of partner payment (see partner_payment_decision).
  deliveredQuantity: integer("delivered_quantity").notNull().default(0),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [
  // A request item pulled from a specific serialized order unit must represent
  // exactly one physical device — quantity>1 on such a row would make serial
  // tracking on delivery_task_item ambiguous.
  check(
    "request_item_order_unit_qty_chk",
    sql`${t.orderUnitId} IS NULL OR ${t.quantity} = 1`
  ),
])

// ─── Partners ───────────────────────────────────────────────────────────────

export const partners = sqliteTable("partner", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id), // optional portal login
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  mobile: text("mobile"),
  email: text("email"),
  city: text("city"),
  status: text("status", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),
  notes: text("notes"),
  // Self-service portal login setup — admin generates, partner opens it once to set their own password.
  activationToken: text("activation_token").unique(),
  activationTokenExpiresAt: integer("activation_token_expires_at"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
  deletedAt: integer("deleted_at"),
})

// ─── Partner contracts ──────────────────────────────────────────────────────

export const partnerContracts = sqliteTable("partner_contract", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id")
    .notNull()
    .references(() => partners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  serviceTypeId: text("service_type_id").references(() => requestTypes.id),
  pricingModel: text("pricing_model", {
    enum: ["per_order", "per_item", "per_day", "per_hour", "fixed"],
  })
    .notNull()
    .default("per_order"),
  unitPrice: real("unit_price").notNull(),
  startDate: integer("start_date"),
  endDate: integer("end_date"),
  status: text("status", { enum: ["active", "expired", "cancelled"] })
    .notNull()
    .default("active"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
})

// ─── Partner tasks ──────────────────────────────────────────────────────────

export const partnerTasks = sqliteTable("partner_task", {
  id: text("id").primaryKey(),
  // Task origin: exactly one of requestId (customer request) or
  // purchaseOrderId (supplier pickup) — enforced by partner_task_single_origin_chk.
  requestId: text("request_id").references(() => requests.id),
  // Supplier-pickup origin (kind = "supplier_pickup"). procurementCaseId is
  // denormalized from the PO for direct case-level queries; always set together.
  procurementCaseId: text("procurement_case_id").references(() => procurementCases.id),
  purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
  kind: text("kind", { enum: ["request", "supplier_pickup"] })
    .notNull()
    .default("request"),
  // Where the pickup is delivered to (free text until a warehouse module exists).
  destinationLocation: text("destination_location"),
  partnerId: text("partner_id")
    .notNull()
    .references(() => partners.id),
  contractId: text("contract_id").references(() => partnerContracts.id),
  contactId: text("contact_id").references(() => customerContacts.id, { onDelete: "set null" }),
  taskTypeId: text("task_type_id").references(() => requestTypes.id),
  // How the task is executed: manual (magic link UI) or api_courier (Sesame etc.)
  executionMode: text("execution_mode", { enum: ["manual", "api_courier"] })
    .notNull()
    .default("manual"),
  // Per-task override: when false the partner can mark done without uploading
  // proof photos, regardless of the global requiredDeliveryPhotoCount setting.
  photoRequired: integer("photo_required", { mode: "boolean" }).notNull().default(true),
  // Magic link
  taskToken: text("task_token").notNull().unique(),
  taskTokenExpiresAt: integer("task_token_expires_at").notNull(),
  status: text("status", {
    enum: [
      "pending",
      "accepted",
      "in_progress",
      "pending_signoff",
      // Supplier-pickup kind only: accepted → arrived → picked_up → closed.
      // "picked_up" means in transit; closure happens only via warehouse receipt.
      "arrived",
      "picked_up",
      "closed",
      "rejected",
      "failed",
      "cancelled",
    ],
  })
    .notNull()
    .default("pending"),
  notes: text("notes"),
  // Failure
  failureReason: text("failure_reason", {
    enum: [
      "customer_unavailable",
      "wrong_address",
      "item_damaged",
      "access_denied",
      "customer_rescheduled",
      "other",
    ],
  }),
  failureNotes: text("failure_notes"),
  // Sign-off (Ops confirms quantity at close)
  signoffQuantity: integer("signoff_quantity"),
  // Timestamps
  assignedBy: text("assigned_by").references(() => users.id),
  assignedAt: integer("assigned_at"),
  acceptedAt: integer("accepted_at"),
  completedAt: integer("completed_at"), // partner marked done
  arrivedAt: integer("arrived_at"), // pickup kind: partner arrived at supplier
  pickedUpAt: integer("picked_up_at"), // pickup kind: goods collected, in transit
  closedBy: text("closed_by").references(() => users.id),
  closedAt: integer("closed_at"),
  // Phase-0 delivery/signature: physical delivery and proof-of-signature are
  // tracked separately from partner marked-done (completedAt) and admin close
  // (closedAt). deliveredAt = handover happened; signatureReceivedAt = an
  // accepted proof (on-site / remote / approved manual upload) was captured.
  deliveredAt: integer("delivered_at"),
  signatureReceivedAt: integer("signature_received_at"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [
  index("partner_task_request_idx").on(t.requestId),
  index("partner_task_partner_status_idx").on(t.partnerId, t.status),
  index("partner_task_po_idx").on(t.purchaseOrderId),
  index("partner_task_case_idx").on(t.procurementCaseId),
  check(
    "partner_task_single_origin_chk",
    sql`(${t.requestId} IS NOT NULL AND ${t.purchaseOrderId} IS NULL) OR (${t.requestId} IS NULL AND ${t.purchaseOrderId} IS NOT NULL)`
  ),
])

// ─── Services catalog ───────────────────────────────────────────────────────

export const servicesCatalog = sqliteTable("services_catalog", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
})

// ─── Failure reasons (config-driven) ────────────────────────────────────────
// Was a fixed text enum on partner_task.failure_reason (no DB check
// constraint on sqlite text columns here, so this table is a safe swap —
// admins manage the list, the column just stores whatever slug is active).

export const failureReasons = sqliteTable("failure_reason", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

// ─── App settings (generic scalar config store) ─────────────────────────────
// Key/value store for admin-tunable scalars (e.g. required photo count,
// token TTLs) so these stop requiring a code change + deploy to adjust.

export const appSettings = sqliteTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
})

// ─── Company operational locations ─────────────────────────────────────────
// Warehouses, offices, and service centres used as real route endpoints. The
// partial unique index guarantees that at most one active default is exposed to
// courier links at a time.

export const companyLocations = sqliteTable("company_location", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["warehouse", "office", "service_center"] })
    .notNull()
    .default("warehouse"),
  contactName: text("contact_name"),
  contactMobile: text("contact_mobile"),
  city: text("city"),
  address: text("address"),
  mapsLink: text("maps_link"),
  workingHours: text("working_hours"),
  accessNotes: text("access_notes"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [
  index("company_location_active_idx").on(t.isActive),
  uniqueIndex("company_location_single_default_idx")
    .on(t.isDefault)
    .where(sql`${t.isDefault} = 1`),
])

// ─── Task services (checklist) ──────────────────────────────────────────────

export const taskServices = sqliteTable("task_service", {
  id: text("id").primaryKey(),
  partnerTaskId: text("partner_task_id")
    .notNull()
    .references(() => partnerTasks.id, { onDelete: "cascade" }),
  serviceId: text("service_id")
    .notNull()
    .references(() => servicesCatalog.id),
  isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
  completedAt: integer("completed_at"),
  notes: text("notes"),
})

// ─── Consent versions (PDPL) ────────────────────────────────────────────────

export const consentVersions = sqliteTable("consent_version", {
  id: text("id").primaryKey(),
  version: text("version").notNull().unique(), // e.g. "1.0"
  textEn: text("text_en").notNull(),
  textAr: text("text_ar").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

// ─── Signature requests ─────────────────────────────────────────────────────

export const signatureRequests = sqliteTable("signature_request", {
  id: text("id").primaryKey(),
  requestId: text("request_id").references(() => requests.id), // nullable — standalone use
  partnerTaskId: text("partner_task_id").references(() => partnerTasks.id),
  initiatedBy: text("initiated_by", { enum: ["admin", "partner", "system"] })
    .notNull()
    .default("admin"),
  initiatorId: text("initiator_id").references(() => users.id),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  // Two-stage signing: receiver acknowledges, authorised signatory finalises.
  signatoryRole: text("signatory_role", { enum: ["receiver", "authorized"] })
    .notNull()
    .default("receiver"),
  // Stage-2 requests point back at the receiver's stage-1 request.
  parentSignatureRequestId: text("parent_signature_request_id"),
  // The customer contact expected to sign this request (receiver or authorised).
  signatoryContactId: text("signatory_contact_id").references(() => customerContacts.id, { onDelete: "set null" }),
  documentName: text("document_name").notNull(),
  documentUrl: text("document_url"),
  secureToken: text("secure_token").notNull().unique(),
  verificationId: text("verification_id").unique(),
  // Configurable per signature request
  requireNationalId: integer("require_national_id", { mode: "boolean" })
    .notNull()
    .default(false),
  otpEnabled: integer("otp_enabled", { mode: "boolean" }).notNull().default(false),
  // Phase-0 delivery OTP: admin generates a 6-digit code, sends it manually,
  // courier enters the recipient's code to unlock the review+signature stage.
  // Only the salted hash is ever stored — plaintext is shown once to admin and
  // never persisted/logged. Consumed on first successful verify.
  otpHash: text("otp_hash"),
  otpExpiresAt: integer("otp_expires_at"),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  otpVerifiedAt: integer("otp_verified_at"),
  expiryEnabled: integer("expiry_enabled", { mode: "boolean" }).notNull().default(false),
  expiresAt: integer("expires_at"),
  reminderEnabled: integer("reminder_enabled", { mode: "boolean" }).notNull().default(false),
  reminderSentAt: integer("reminder_sent_at"),
  status: text("status", {
    enum: [
      "draft",
      "sent",
      "opened",
      "otp_verified",
      "signed",
      "rejected",
      "expired",
      "cancelled",
    ],
  })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [index("signature_request_request_idx").on(t.requestId)])

// ─── Signature events (open tracking) ───────────────────────────────────────

export const signatureEvents = sqliteTable("signature_event", {
  id: text("id").primaryKey(),
  signatureRequestId: text("signature_request_id")
    .notNull()
    .references(() => signatureRequests.id, { onDelete: "cascade" }),
  eventType: text("event_type", {
    enum: ["sent", "opened", "otp_sent", "otp_verified", "signed", "rejected"],
  }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata"), // JSON
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

// ─── Customer signatures ─────────────────────────────────────────────────────

export const customerSignatures = sqliteTable("customer_signature", {
  id: text("id").primaryKey(),
  signatureRequestId: text("signature_request_id")
    .notNull()
    .unique()
    .references(() => signatureRequests.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  mobile: text("mobile").notNull(),
  nationalId: text("national_id"), // nullable — encrypted at app layer
  // Receiver's role at handover (free text, e.g. "Warehouse manager").
  position: text("position"),
  // base64 PNG for electronic signatures; "" for manual_upload (the signed
  // artefact lives in uploadedFileUrl instead — distinguish via signatureMethod).
  signatureData: text("signature_data").notNull(), // base64 SVG/PNG
  // How the signed receipt was captured. electronic = on-device or remote
  // signature pad; manual_upload = customer printed, signed, returned a file.
  signatureMethod: text("signature_method", { enum: ["electronic", "manual_upload"] })
    .notNull()
    .default("electronic"),
  // Delivery outcome selected by the receiver at signing time. Drives the
  // signOffTask gate: full_* → closable; partial → on_hold; refused → failed.
  deliveryOutcome: text("delivery_outcome", {
    enum: ["full_no_remarks", "full_with_remarks", "partial", "refused"],
  }),
  // Free-text remarks (required for full_with_remarks / partial / refused).
  remarks: text("remarks"),
  // Immutable frozen snapshot of the signed receipt (JSON): request/quote
  // numbers, customer block, items with per-item condition + received qty,
  // outcome, remarks, signer. Rendered in preference to live tables so later
  // edits to the request never rewrite an already-signed historical receipt.
  snapshot: text("snapshot"),
  // Manual-upload review trail (signatureMethod = manual_upload).
  uploadedFileUrl: text("uploaded_file_url"),
  uploadedBy: text("uploaded_by").references(() => users.id),
  uploadedAt: integer("uploaded_at"),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: integer("approved_at"),
  reviewNotes: text("review_notes"),
  consentVersion: text("consent_version").references(() => consentVersions.version),
  consentAcceptedAt: integer("consent_accepted_at"),
  signedAt: integer("signed_at").notNull().$defaultFn(now),
  signedAtTz: text("signed_at_tz").notNull().default("Asia/Riyadh"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  auditDataHash: text("audit_data_hash"),
})

// ─── Signature item conditions (per-item acknowledgement on signing) ─────────

export const signatureItemConditions = sqliteTable("signature_item_condition", {
  id: text("id").primaryKey(),
  signatureRequestId: text("signature_request_id")
    .notNull()
    .references(() => signatureRequests.id, { onDelete: "cascade" }),
  requestItemId: text("request_item_id")
    .notNull()
    .references(() => requestItems.id, { onDelete: "cascade" }),
  condition: text("condition", { enum: ["good", "damaged", "missing"] })
    .notNull()
    .default("good"),
  receivedQuantity: integer("received_quantity"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [index("signature_item_condition_sig_idx").on(t.signatureRequestId)])

// ─── Communication log (manual-channel audit) ───────────────────────────────
// Phase-0 manual comms are prepared in the admin UI and sent by a human via
// WhatsApp / Outlook / mailto / copy. Opening a channel is NOT proof of send,
// so status starts at "prepared" and only an explicit admin confirmation moves
// it to "manually_confirmed_sent". OTP plaintext is NEVER written here.

export const communicationLog = sqliteTable("communication_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(), // e.g. "signature_request", "partner_task", "request"
  entityId: text("entity_id").notNull(),
  channel: text("channel", { enum: ["whatsapp", "email", "outlook", "mailto", "copy"] }).notNull(),
  messageType: text("message_type").notNull(), // e.g. "otp_delivery", "remote_signature", "signed_receipt"
  recipient: text("recipient"), // mobile or email (never the OTP)
  status: text("status", { enum: ["prepared", "manually_confirmed_sent", "cancelled"] })
    .notNull()
    .default("prepared"),
  preparedBy: text("prepared_by").references(() => users.id),
  preparedAt: integer("prepared_at").notNull().$defaultFn(now),
  confirmedAt: integer("confirmed_at"),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [index("communication_log_entity_idx").on(t.entityType, t.entityId)])

// ─── Notifications (in-app bell for admin + partner users) ───────────────────

export const notifications = sqliteTable("notification", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // e.g. "task_assigned", "customer_signed"
  i18nKey: text("i18n_key").notNull(),
  i18nData: text("i18n_data"), // JSON — interpolation data
  linkUrl: text("link_url"), // where clicking the notification navigates
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  // Idempotency key for event-driven notifications: `${eventId}:${userId}`.
  // The outbox drain can retry a delivery, so the consumer inserts with
  // onConflictDoNothing on this key. Null for legacy/direct notifications.
  dedupeKey: text("dedupe_key"),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [
  index("notification_user_idx").on(t.userId, t.readAt),
  uniqueIndex("notification_dedupe_key_idx").on(t.dedupeKey),
])

// ─── Attachments ─────────────────────────────────────────────────────────────

export const attachments = sqliteTable("attachment", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", {
    enum: ["request", "partner_task", "signature_request", "asset", "purchase_order", "warranty_assignment"],
  }).notNull(),
  entityId: text("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // Vercel Blob URL (kept for existing readers)
  fileType: text("file_type").notNull(), // image/jpeg | image/png | image/heic
  fileSize: integer("file_size").notNull(), // bytes
  uploadedBy: text("uploaded_by"), // user_id or partner task context
  uploadSource: text("upload_source", { enum: ["admin", "partner_link"] })
    .notNull()
    .default("admin"),
  // Provider-neutral document storage abstraction (Milestone 2 / B1). Only
  // "vercel_blob" is implemented; the enum leaves room for future adapters
  // (e.g. "google_drive") without new provider-specific columns.
  provider: text("provider", { enum: ["vercel_blob", "google_drive"] })
    .notNull()
    .default("vercel_blob"),
  providerFileId: text("provider_file_id"), // provider's native object/file id, if any
  providerUrl: text("provider_url"), // provider's canonical URL (mirrors fileUrl for blob today)
  storagePath: text("storage_path"), // logical path/key within the provider, if applicable
  sensitivity: text("sensitivity", { enum: ["sensitive", "operational"] })
    .notNull()
    .default("sensitive"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

// ─── Activity logs (append-only audit trail) ─────────────────────────────────

export const activityLogs = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", {
    enum: ["request", "partner_task", "signature_request", "payment_batch", "purchase_order"],
  }).notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // e.g. "status_changed", "task_assigned"
  i18nKey: text("i18n_key").notNull(), // translation key for bilingual display
  i18nData: text("i18n_data"), // JSON — interpolation data
  performedBy: text("performed_by").references(() => users.id),
  performedAs: text("performed_as", {
    enum: ["user", "partner_link", "system"],
  })
    .notNull()
    .default("user"),
  ipAddress: text("ip_address"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [index("activity_log_entity_idx").on(t.entityType, t.entityId)])

// ─── Payment batches ─────────────────────────────────────────────────────────

export const paymentBatches = sqliteTable("payment_batch", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id")
    .notNull()
    .references(() => partners.id),
  period: text("period").notNull(), // "YYYY-MM" e.g. "2026-01"
  totalAmount: real("total_amount").notNull().default(0),
  status: text("status", {
    enum: ["draft", "approved", "sent_to_finance", "paid"],
  })
    .notNull()
    .default("draft"),
  // Public statement link the partner opens (no account) to review line items
  statementToken: text("statement_token").unique(),
  generatedAt: integer("generated_at").notNull().$defaultFn(now),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: integer("approved_at"),
  sentAt: integer("sent_at"),
  paidAt: integer("paid_at"),
  notes: text("notes"),
})

// ─── Partner payments ─────────────────────────────────────────────────────────

export const partnerPayments = sqliteTable("partner_payment", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id")
    .notNull()
    .references(() => partners.id),
  partnerTaskId: text("partner_task_id")
    .notNull()
    .unique()
    .references(() => partnerTasks.id),
  batchId: text("batch_id").references(() => paymentBatches.id), // nullable until batched
  pricingModel: text("pricing_model", {
    enum: ["per_order", "per_item", "per_day", "per_hour", "fixed"],
  }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull(),
  totalAmount: real("total_amount").notNull(), // quantity × unit_price
  status: text("status", {
    enum: ["pending", "batched", "paid", "on_hold"],
  })
    .notNull()
    .default("pending"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [
  index("partner_payment_partner_status_idx").on(t.partnerId, t.status),
  index("partner_payment_batch_idx").on(t.batchId),
])

// ─── Partner payment decisions ────────────────────────────────────────────────
// Separate, always-created audit record for the admin's payment decision at
// sign-off — independent of whether a partner_payment row exists (decision
// "none"/"hold" never create one). One decision per task (UNIQUE), upserted
// while the task is still open, immutable in practice once the task closes.

export const partnerPaymentDecisions = sqliteTable("partner_payment_decision", {
  id: text("id").primaryKey(),
  partnerTaskId: text("partner_task_id")
    .notNull()
    .unique()
    .references(() => partnerTasks.id),
  decision: text("decision", { enum: ["full", "partial", "none", "hold"] }).notNull(),
  approvedAmount: real("approved_amount"),
  reason: text("reason"),
  decidedBy: text("decided_by")
    .notNull()
    .references(() => users.id),
  decidedAt: integer("decided_at").notNull(),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
})

// ─── Delivery task items ───────────────────────────────────────────────────────
// Per-task allocation against a request_item (mirrors pickup_task_line). Also
// carries the serial report-and-approve trail for serialized items: partner-
// reported evidence is never authoritative until admin approves/corrects it.

export const deliveryTaskItems = sqliteTable("delivery_task_item", {
  id: text("id").primaryKey(),
  partnerTaskId: text("partner_task_id")
    .notNull()
    .references(() => partnerTasks.id),
  requestItemId: text("request_item_id")
    .notNull()
    .references(() => requestItems.id),
  qtyPlanned: integer("qty_planned").notNull(),
  qtyDelivered: integer("qty_delivered").notNull().default(0),
  reportedSerial: text("reported_serial"),
  reportedBy: text("reported_by").references(() => users.id),
  reportedAt: integer("reported_at"),
  correctedSerial: text("corrected_serial"),
  correctedBy: text("corrected_by").references(() => users.id),
  correctedAt: integer("corrected_at"),
  verificationStatus: text("verification_status", {
    enum: ["unreported", "reported", "mismatch", "approved", "rejected"],
  })
    .notNull()
    .default("unreported"),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: integer("approved_at"),
  // Required when an approved serial materially replaces the pre-allocated
  // request_item.orderUnitId (a different physical unit than expected).
  relinkReason: text("relink_reason"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [
  uniqueIndex("delivery_task_item_task_item_idx").on(t.partnerTaskId, t.requestItemId),
  index("delivery_task_item_request_item_idx").on(t.requestItemId),
])

// ─── Delivery snapshot amendments ──────────────────────────────────────────────
// The customer-signed snapshot (customer_signature.snapshot) is permanently
// immutable. When an approved admin correction changes customer-facing
// delivery content (e.g. a relinked serial), it is recorded here as a linked,
// versioned amendment — never merged back into the original signed JSON.

export const deliverySnapshotAmendments = sqliteTable("delivery_snapshot_amendment", {
  id: text("id").primaryKey(),
  signatureRequestId: text("signature_request_id")
    .notNull()
    .references(() => signatureRequests.id),
  deliveryTaskItemId: text("delivery_task_item_id")
    .notNull()
    .references(() => deliveryTaskItems.id),
  fieldChanged: text("field_changed").notNull(),
  originalValue: text("original_value").notNull(),
  correctedValue: text("corrected_value").notNull(),
  reason: text("reason").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

// ─── Type exports ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type RequestType = typeof requestTypes.$inferSelect
export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type CustomerLocation = typeof customerLocations.$inferSelect
export type CustomerContactLocation = typeof customerContactLocations.$inferSelect
export type Request = typeof requests.$inferSelect
export type NewRequest = typeof requests.$inferInsert
export type RequestItem = typeof requestItems.$inferSelect
export type Partner = typeof partners.$inferSelect
export type NewPartner = typeof partners.$inferInsert
export type PartnerContract = typeof partnerContracts.$inferSelect
export type PartnerTask = typeof partnerTasks.$inferSelect
export type NewPartnerTask = typeof partnerTasks.$inferInsert
export type ServicesCatalog = typeof servicesCatalog.$inferSelect
export type FailureReason = typeof failureReasons.$inferSelect
export type AppSetting = typeof appSettings.$inferSelect
export type UserInvite = typeof userInvites.$inferSelect
export type TaskService = typeof taskServices.$inferSelect
export type SignatureRequest = typeof signatureRequests.$inferSelect
export type NewSignatureRequest = typeof signatureRequests.$inferInsert
export type SignatureEvent = typeof signatureEvents.$inferSelect
export type CustomerSignature = typeof customerSignatures.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type ActivityLog = typeof activityLogs.$inferSelect
export type PaymentBatch = typeof paymentBatches.$inferSelect
export type PartnerPayment = typeof partnerPayments.$inferSelect

export type CustomerContact = typeof customerContacts.$inferSelect
export type SignatureItemCondition = typeof signatureItemConditions.$inferSelect
export type NewSignatureItemCondition = typeof signatureItemConditions.$inferInsert
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert

// ─── Suppliers (vendors we purchase devices from) ────────────────────────────

export const suppliers = sqliteTable("supplier", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  mobile: text("mobile"),
  email: text("email"),
  city: text("city"),
  address: text("address"),
  notes: text("notes"),
  // Supplier-pickup logistics: inherited onto pickup tasks at creation time.
  pickupContactName: text("pickup_contact_name"),
  pickupContactMobile: text("pickup_contact_mobile"),
  pickupMapsUrl: text("pickup_maps_url"),
  pickupNotes: text("pickup_notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
  deletedAt: integer("deleted_at"),
})

// ─── Orders (client orders derived from an accepted quotation) ───────────────
// Distinct from Request: an Order is the commercial source-of-truth (from the
// quote). One Order can feed many Requests over time via partial unit pulls.

export const orders = sqliteTable(
  "order",
  {
    id: text("id").primaryKey(),
    // Same number as the sales quotation, e.g. "10669". Unique per order.
    orderNumber: text("order_number").notNull().unique(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    contactPerson: text("contact_person"),
    contactMobile: text("contact_mobile"),
    contactEmail: text("contact_email"),
    quoteDate: integer("quote_date"),
    // Commercial go-ahead: once the customer accepts the quotation, the
    // order becomes confirmed and the buying journey can begin.
    customerConfirmedAt: integer("customer_confirmed_at"),
    // Commercial terms captured from the quote (stored, not billed in v1).
    rentalPeriodMonths: integer("rental_period_months"),
    additionalPeriodMonths: integer("additional_period_months"),
    total: real("total"),
    status: text("status", {
      enum: ["draft", "confirmed", "partially_fulfilled", "fulfilled", "cancelled"],
    })
      .notNull()
      .default("draft"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("order_customer_idx").on(t.customerId)]
)

// ─── Order lines (one row per ordered spec + quantity) ───────────────────────

export const orderLines = sqliteTable(
  "order_line",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Per-line fulfilment type. A single order mixes lines: rental_asset lines
    // draw from rental inventory and must return; sold_product lines draw from
    // products-for-sale (serialized order_unit(kind=sale) or qty-stock) and end
    // as sold. Existing rows backfill to "rental_asset".
    type: text("type", { enum: ["rental_asset", "sold_product"] })
      .notNull()
      .default("rental_asset"),
    description: text("description").notNull(),
    brand: text("brand"),
    model: text("model"),
    quantity: integer("quantity").notNull().default(1),
    rentalMonths: integer("rental_months"),
    unitPriceMonthly: real("unit_price_monthly"),
    lineTotal: real("line_total"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("order_line_order_idx").on(t.orderId)]
)

// ─── Order units (one row per physical device: serial + supplier + cost) ─────
// This is the asset-instance layer. Serials are optional at creation (devices
// may not have arrived yet). Designed to grow into a standalone Devices view.

export const orderUnits = sqliteTable(
  "order_unit",
  {
    id: text("id").primaryKey(),
    // Exactly one origin: a client order-line OR a purchase-order-line, never
    // both/neither — enforced by CHECK constraint below (Milestone 3 / P4).
    orderLineId: text("order_line_id").references(() => orderLines.id, { onDelete: "cascade" }),
    // Denormalised for easy per-order queries without a join through lines.
    orderId: text("order_id").references(() => orders.id, { onDelete: "cascade" }),
    purchaseOrderLineId: text("purchase_order_line_id").references(() => purchaseOrderLines.id, {
      onDelete: "restrict",
    }),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id, {
      onDelete: "restrict",
    }),
    serialNumber: text("serial_number"),
    supplierId: text("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    purchaseCost: real("purchase_cost"),
    purchaseDate: integer("purchase_date"),
    warrantyEnd: integer("warranty_end"),
    // KARA asset tag (KARA-00001). Nullable until back-filled; unique when set.
    assetTag: text("asset_tag"),
    // Ownership/return semantics — NOT serialization. A rental unit is
    // company-owned and must return; a sale unit is a serialized product sold
    // to the customer (ownership transfers, never returns). Non-serial sold
    // products live in the qty-stock tables, not here. Existing rows backfill
    // to "rental" (all historical order_units were rental assets).
    kind: text("kind", { enum: ["rental", "sale"] })
      .notNull()
      .default("rental"),
    status: text("status", {
      enum: [
        "receiving_qc",
        "in_stock",
        "reserved",
        "assigned",
        "delivered",
        "returned",
        "maintenance",
        "damaged",
        "supplier_return_pending",
        "supplier_returned",
        "retired",
        "sold",
        "lost",
      ],
    })
      .notNull()
      .default("in_stock"),
    location: text("location").notNull().default("main_warehouse"),
    // Where the asset currently is when out of the warehouse.
    currentRequestId: text("current_request_id"),
    currentCustomerId: text("current_customer_id"),
    retiredAt: integer("retired_at"),
    retirementReason: text("retirement_reason"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("order_unit_order_idx").on(t.orderId),
    index("order_unit_line_idx").on(t.orderLineId),
    index("order_unit_po_line_idx").on(t.purchaseOrderLineId),
    index("order_unit_status_idx").on(t.status),
    index("order_unit_kind_idx").on(t.kind),
    uniqueIndex("order_unit_serial_idx")
      .on(sql`lower(trim(${t.serialNumber}))`)
      .where(sql`${t.serialNumber} IS NOT NULL AND trim(${t.serialNumber}) <> ''`),
    index("order_unit_current_customer_idx").on(t.currentCustomerId),
    uniqueIndex("order_unit_asset_tag_idx").on(t.assetTag),
    check(
      "order_unit_single_origin_chk",
      sql`(${t.orderLineId} IS NOT NULL AND ${t.purchaseOrderLineId} IS NULL) OR (${t.orderLineId} IS NULL AND ${t.purchaseOrderLineId} IS NOT NULL)`
    ),
  ]
)

// ─── Asset events (timeline / passport of each device) ──────────────────────
// One row per lifecycle event: status changes, assignments, notes, maintenance.

export const assetEvents = sqliteTable(
  "asset_event",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => orderUnits.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["status_change", "assigned", "delivered", "returned", "note", "maintenance", "created", "retired", "correction"],
    }).notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    requestId: text("request_id"),
    customerId: text("customer_id"),
    notes: text("notes"),
    byUserId: text("by_user_id"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("asset_event_asset_idx").on(t.assetId, t.createdAt)]
)

// ─── Supplier returns / replacements ────────────────────────────────────────
// A rejected received asset stays traceable to its original PO and supplier.
// Replacement assets are created through the normal Asset creation chokepoint
// and linked back here, without increasing the PO's commercial received qty.

export const supplierReturns = sqliteTable(
  "supplier_return",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => orderUnits.id, { onDelete: "restrict" }),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "restrict" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    resolution: text("resolution", { enum: ["replacement", "refund"] }).notNull(),
    status: text("status", {
      enum: ["requested", "awaiting_replacement", "replacement_received", "resolved", "cancelled"],
    })
      .notNull()
      .default("requested"),
    reason: text("reason").notNull(),
    rmaReference: text("rma_reference"),
    replacementAssetId: text("replacement_asset_id").references(() => orderUnits.id, { onDelete: "set null" }),
    returnedAt: integer("returned_at"),
    resolvedAt: integer("resolved_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("supplier_return_asset_idx").on(t.assetId, t.createdAt),
    index("supplier_return_po_idx").on(t.purchaseOrderId, t.createdAt),
    index("supplier_return_status_idx").on(t.status),
  ]
)

// ─── Purchase orders (procurement layer — feeds Asset creation) ─────────────
// Distinct from "order" (client commercial order). A purchase order is what
// we buy from a supplier; receiving a line creates an Asset (order_unit row)
// via the same createAssetCore used by the existing minimal-entry flow.

export const purchaseOrders = sqliteTable(
  "purchase_order",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    poNumber: text("po_number").notNull().unique(),
    status: text("status", {
      enum: ["draft", "ordered", "partially_received", "received", "cancelled"],
    })
      .notNull()
      .default("draft"),
    invoiceRef: text("invoice_ref"),
    orderedAt: integer("ordered_at"),
    // Optional lifecycle milestones. Payment itself lives in the ERP; paidAt
    // only records that ops confirmed it. readyForPickupAt gates pickup tasks.
    paidAt: integer("paid_at"),
    readyForPickupAt: integer("ready_for_pickup_at"),
    // When true, received assets mint at "receiving_qc" and require an
    // explicit qc_pass before becoming available inventory.
    qcRequired: integer("qc_required", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    // Commercial & Sourcing (M4.5): the operational anchor. Every PO (manual
    // or commercial-flow) gets one at write time — enforced NOT NULL since
    // prod had 0 purchase_order rows at rollout, so no backfill was needed.
    procurementCaseId: text("procurement_case_id")
      .notNull()
      .references(() => procurementCases.id, { onDelete: "restrict" }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("purchase_order_supplier_idx").on(t.supplierId),
    // One purchase order per procurement case. Enforces the one-case→one-PO
    // invariant at the DB level so a lost race in createPurchaseOrderFromCase
    // can never persist a duplicate PO.
    uniqueIndex("purchase_order_case_idx").on(t.procurementCaseId),
  ]
)

export const purchaseOrderLines = sqliteTable(
  "purchase_order_line",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemDescription: text("item_description").notNull(),
    brand: text("brand"),
    model: text("model"),
    requiresSerial: integer("requires_serial", { mode: "boolean" }).notNull().default(true),
    // Destination inventory for units received against this line: rental pool
    // (order_unit.kind=rental) or products-for-sale (order_unit.kind=sale).
    // Serialization (requiresSerial) is independent of this. Existing rows
    // backfill to "rental".
    kind: text("kind", { enum: ["rental", "sale"] })
      .notNull()
      .default("rental"),
    qtyOrdered: integer("qty_ordered").notNull(),
    qtyReceived: integer("qty_received").notNull().default(0),
    // Units collected from the supplier by pickup partners (in transit until
    // received). Guarded increment: qtyPickedUp never exceeds qtyOrdered.
    qtyPickedUp: integer("qty_picked_up").notNull().default(0),
    unitCost: real("unit_cost"),
    // A line is never deleted once it may carry history — it is cancelled
    // instead (only allowed while qtyReceived = 0). Cancelled lines are
    // excluded from the PO's aggregate received/ordered status.
    status: text("status", { enum: ["active", "cancelled"] })
      .notNull()
      .default("active"),
    cancelledAt: integer("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("purchase_order_line_po_idx").on(t.purchaseOrderId)]
)

// ─── Pickup task lines (supplier pickup — partial pickups/receipts) ─────────
// One row per (pickup task × PO line). qtyPlanned is what this task should
// collect; qtyPickedUp what the partner actually collected; qtyReceived what
// the warehouse confirmed against THIS task. Invariants (app-level, FKs off):
// Σ qtyPlanned over open tasks ≤ line.qtyOrdered − line.qtyPickedUp at plan
// time; qtyPickedUp ≤ qtyPlanned; qtyReceived ≤ qtyPickedUp.

export const pickupTaskLines = sqliteTable(
  "pickup_task_line",
  {
    id: text("id").primaryKey(),
    pickupTaskId: text("pickup_task_id")
      .notNull()
      .references(() => partnerTasks.id, { onDelete: "cascade" }),
    purchaseOrderLineId: text("purchase_order_line_id")
      .notNull()
      .references(() => purchaseOrderLines.id, { onDelete: "restrict" }),
    qtyPlanned: integer("qty_planned").notNull(),
    qtyPickedUp: integer("qty_picked_up").notNull().default(0),
    qtyReceived: integer("qty_received").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("pickup_task_line_task_line_idx").on(t.pickupTaskId, t.purchaseOrderLineId),
    index("pickup_task_line_po_line_idx").on(t.purchaseOrderLineId),
  ]
)

export type PickupTaskLine = typeof pickupTaskLines.$inferSelect
export type NewPickupTaskLine = typeof pickupTaskLines.$inferInsert

// ─── Commercial & Sourcing (M4.5) ────────────────────────────────────────────
// KOPH owns Need→Sourcing→RFQ→Quotations→Evaluation→Approval→Procurement Case.
// Zoho/Odoo own the PO itself onward (vendor bills, accounting, payments).
// KOPH resumes ownership at Receiving (purchase_order/purchase_order_line
// above, unchanged). Every node here is permanent: no delete action is ever
// exposed, only status transitions to cancelled/superseded/closed. Past
// commercial_approval / procurement_case creation / its ERP-PO link, those
// rows are never updated again — a change is a new row that supersedes.

export const sourcingRequests = sqliteTable(
  "sourcing_request",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type", {
      enum: ["customer_order", "stock_replenishment", "operational_need"],
    }).notNull(),
    // Only set when sourceType = customer_order.
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderLineId: text("order_line_id").references(() => orderLines.id, { onDelete: "set null" }),
    // External business reference — the original customer request number
    // (Notion today, Odoo later). This is the anchor everything traces back to.
    externalRef: text("external_ref"),
    title: text("title"),
    description: text("description").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "rfq_sent",
        "quotes_received",
        "under_evaluation",
        "approved",
        "rejected",
        "handed_off",
        "cancelled",
        "closed",
      ],
    })
      .notNull()
      .default("draft"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("sourcing_request_order_idx").on(t.orderId),
    index("sourcing_request_status_idx").on(t.status),
    index("sourcing_request_external_ref_idx").on(t.externalRef),
  ]
)

// One row per requested product within a sourcing request (Sourcing V2).
// Three description tiers: customerDescription is the FINAL delivered
// configuration (feeds delivery note / asset sheet), supplierDescription is
// what suppliers see in RFQs and later purchasing, partNumber is reference
// data only — never the workflow entity. Spec fields + quantity lock once the
// item is awarded under an approved evaluation (enforced app-level in *Core
// guards; unlock only via evaluation supersede → re-award → re-approve).
export const sourcingRequestItems = sqliteTable(
  "sourcing_request_item",
  {
    id: text("id").primaryKey(),
    sourcingRequestId: text("sourcing_request_id")
      .notNull()
      .references(() => sourcingRequests.id),
    quantity: integer("quantity").notNull().default(1),
    customerDescription: text("customer_description").notNull(),
    supplierDescription: text("supplier_description").notNull(),
    partNumber: text("part_number"),
    notes: text("notes"),
    status: text("status", {
      enum: ["pending", "rfq_sent", "quoted", "selected", "not_sourced", "cancelled"],
    })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("sourcing_request_item_request_idx").on(t.sourcingRequestId),
    index("sourcing_request_item_part_number_idx").on(t.partNumber),
  ]
)

export const supplierRfqs = sqliteTable(
  "supplier_rfq",
  {
    id: text("id").primaryKey(),
    sourcingRequestId: text("sourcing_request_id")
      .notNull()
      .references(() => sourcingRequests.id),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: text("status", {
      enum: ["sent", "responded", "declined", "expired", "cancelled"],
    })
      .notNull()
      .default("sent"),
    sentAt: integer("sent_at").notNull().$defaultFn(now),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("supplier_rfq_request_idx").on(t.sourcingRequestId),
    index("supplier_rfq_supplier_idx").on(t.supplierId),
  ]
)

// Subset selector (Sourcing V2): which request items a given RFQ carries.
// The same item may appear in many RFQs — competitive quoting across
// suppliers AND repeat/revised RFQs to the same supplier (no unique
// (request, supplier) constraint by design; history is rows + sentAt).
export const supplierRfqItems = sqliteTable(
  "supplier_rfq_item",
  {
    id: text("id").primaryKey(),
    rfqId: text("rfq_id")
      .notNull()
      .references(() => supplierRfqs.id),
    sourcingRequestItemId: text("sourcing_request_item_id")
      .notNull()
      .references(() => sourcingRequestItems.id),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("supplier_rfq_item_rfq_idx").on(t.rfqId),
    index("supplier_rfq_item_item_idx").on(t.sourcingRequestItemId),
  ]
)

export const supplierQuotations = sqliteTable(
  "supplier_quotation",
  {
    id: text("id").primaryKey(),
    rfqId: text("rfq_id")
      .notNull()
      .references(() => supplierRfqs.id),
    validUntil: integer("valid_until"),
    notes: text("notes"),
    status: text("status", {
      enum: ["submitted", "selected", "rejected", "superseded", "cancelled"],
    })
      .notNull()
      .default("submitted"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("supplier_quotation_rfq_idx").on(t.rfqId)]
)

// Line items are leaf detail rows of a still-existing quotation — cascade
// here is only ever a backstop, the app never deletes the parent quotation.
export const supplierQuotationLines = sqliteTable(
  "supplier_quotation_line",
  {
    id: text("id").primaryKey(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => supplierQuotations.id, { onDelete: "cascade" }),
    itemDescription: text("item_description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPrice: real("unit_price"),
    leadTimeDays: integer("lead_time_days"),
    // Sourcing V2 — nullable for legacy rows; required app-side for new
    // writes. Which request item this line answers (comparison key).
    sourcingRequestItemId: text("sourcing_request_item_id").references(
      () => sourcingRequestItems.id
    ),
    // What the supplier actually offers. Purchased config = offered part
    // number + spec + upgrades; delivered config stays the item's
    // customerDescription. Deliberately no BOM/configurable-product system.
    offeredPartNumber: text("offered_part_number"),
    offeredSpec: text("offered_spec"),
    currency: text("currency").default("SAR"),
    taxRate: real("tax_rate"),
    availability: text("availability"),
    warranty: text("warranty"),
    validUntil: integer("valid_until"),
    upgradesNote: text("upgrades_note"),
    upgradesCost: real("upgrades_cost"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("supplier_quotation_line_quotation_idx").on(t.quotationId),
    index("supplier_quotation_line_item_idx").on(t.sourcingRequestItemId),
    index("supplier_quotation_line_part_number_idx").on(t.offeredPartNumber),
  ]
)

export const commercialEvaluations = sqliteTable(
  "commercial_evaluation",
  {
    id: text("id").primaryKey(),
    sourcingRequestId: text("sourcing_request_id")
      .notNull()
      .references(() => sourcingRequests.id),
    chosenQuotationId: text("chosen_quotation_id").references(() => supplierQuotations.id),
    status: text("status", { enum: ["active", "superseded", "cancelled"] })
      .notNull()
      .default("active"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("commercial_evaluation_request_idx").on(t.sourcingRequestId)]
)

// Per-item award (Sourcing V2) — the single source of truth for "which
// quotation line won this item, and why". Append-only: changing an award
// means superseding the whole evaluation (existing locked rule) and creating
// a new evaluation with new lines. Cheapest is never auto-selected; the
// reason is always an explicit human decision. An item's "selected" state is
// derived from the latest non-superseded evaluation, never stored twice.
export const commercialEvaluationLines = sqliteTable(
  "commercial_evaluation_line",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => commercialEvaluations.id),
    sourcingRequestItemId: text("sourcing_request_item_id")
      .notNull()
      .references(() => sourcingRequestItems.id),
    chosenQuotationLineId: text("chosen_quotation_line_id")
      .notNull()
      .references(() => supplierQuotationLines.id),
    reason: text("reason", {
      enum: ["lowest_price", "fastest_delivery", "recommended", "manual"],
    }).notNull(),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("commercial_evaluation_line_evaluation_idx").on(t.evaluationId),
    index("commercial_evaluation_line_item_idx").on(t.sourcingRequestItemId),
  ]
)

// Append-only past creation (locked, 2026-07-10): a re-approval after a
// change is a new row referencing a (possibly new) evaluation, never an edit.
export const commercialApprovals = sqliteTable(
  "commercial_approval",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => commercialEvaluations.id),
    decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
    approverId: text("approver_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    decidedAt: integer("decided_at").notNull().$defaultFn(now),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("commercial_approval_evaluation_idx").on(t.evaluationId)]
)

// The single operational anchor (locked, 2026-07-10): every purchase belongs
// to exactly one. source="system_manual" covers manual POs created without
// going through the commercial flow — never a second procurement workflow.
// Append-only past creation and past its ERP-PO link being set: a change is a
// new row (previousCaseId → old) that supersedes the old one, never an edit.
export const procurementCases = sqliteTable(
  "procurement_case",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: ["commercial_flow", "system_manual"] }).notNull(),
    // Both null for source="system_manual".
    sourcingRequestId: text("sourcing_request_id").references(() => sourcingRequests.id),
    commercialApprovalId: text("commercial_approval_id").references(() => commercialApprovals.id),
    // Sourcing V2: one case per (request × awarded supplier) — each case maps
    // to exactly one external ERP PO. Nullable for legacy/system_manual rows.
    supplierId: text("supplier_id").references(() => suppliers.id),
    status: text("status", {
      enum: ["open", "handed_off", "po_linked", "closed", "cancelled", "superseded"],
    })
      .notNull()
      .default("open"),
    // ERP link-back — set once, never updated after (see note above).
    erpSystem: text("erp_system", { enum: ["zoho", "odoo"] }),
    externalPoRef: text("external_po_ref"),
    externalPoCreatedAt: integer("external_po_created_at"),
    previousCaseId: text("previous_case_id").references((): AnySQLiteColumn => procurementCases.id),
    supersededByCaseId: text("superseded_by_case_id").references(
      (): AnySQLiteColumn => procurementCases.id
    ),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("procurement_case_sourcing_request_idx").on(t.sourcingRequestId),
    index("procurement_case_status_idx").on(t.status),
  ]
)

export type SourcingRequest = typeof sourcingRequests.$inferSelect
export type NewSourcingRequest = typeof sourcingRequests.$inferInsert
export type SourcingRequestItem = typeof sourcingRequestItems.$inferSelect
export type NewSourcingRequestItem = typeof sourcingRequestItems.$inferInsert
export type SupplierRfqItem = typeof supplierRfqItems.$inferSelect
export type NewSupplierRfqItem = typeof supplierRfqItems.$inferInsert
export type CommercialEvaluationLine = typeof commercialEvaluationLines.$inferSelect
export type NewCommercialEvaluationLine = typeof commercialEvaluationLines.$inferInsert
export type SupplierRfq = typeof supplierRfqs.$inferSelect
export type NewSupplierRfq = typeof supplierRfqs.$inferInsert
export type SupplierQuotation = typeof supplierQuotations.$inferSelect
export type NewSupplierQuotation = typeof supplierQuotations.$inferInsert
export type SupplierQuotationLine = typeof supplierQuotationLines.$inferSelect
export type NewSupplierQuotationLine = typeof supplierQuotationLines.$inferInsert
export type CommercialEvaluation = typeof commercialEvaluations.$inferSelect
export type NewCommercialEvaluation = typeof commercialEvaluations.$inferInsert
export type CommercialApproval = typeof commercialApprovals.$inferSelect
export type NewCommercialApproval = typeof commercialApprovals.$inferInsert
export type ProcurementCase = typeof procurementCases.$inferSelect
export type NewProcurementCase = typeof procurementCases.$inferInsert

// ─── Warranty (separate module — assigned to an Asset, not asset fields) ────

export const warrantyProducts = sqliteTable("warranty_product", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  durationMonths: integer("duration_months").notNull(),
  providerName: text("provider_name"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

export const warrantyBatches = sqliteTable(
  "warranty_batch",
  {
    id: text("id").primaryKey(),
    warrantyProductId: text("warranty_product_id")
      .notNull()
      .references(() => warrantyProducts.id),
    source: text("source", {
      enum: ["with_device", "separate", "other_supplier", "bulk"],
    }).notNull(),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),
    invoiceRef: text("invoice_ref"),
    unitsCovered: integer("units_covered").notNull().default(1),
    unitsAssigned: integer("units_assigned").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("warranty_batch_product_idx").on(t.warrantyProductId)]
)

export const warrantyAssignments = sqliteTable(
  "warranty_assignment",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => orderUnits.id, { onDelete: "cascade" }),
    warrantyBatchId: text("warranty_batch_id")
      .notNull()
      .references(() => warrantyBatches.id),
    status: text("status", {
      enum: [
        "purchased_not_assigned",
        "assigned_not_activated",
        "activation_pending",
        "active",
        "expired",
        "cancelled",
        "unknown",
      ],
    })
      .notNull()
      .default("assigned_not_activated"),
    activationDueAt: integer("activation_due_at"),
    startAt: integer("start_at"),
    endAt: integer("end_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("warranty_assignment_asset_idx").on(t.assetId),
    index("warranty_assignment_status_idx").on(t.status),
  ]
)

// ─── Accessories (serialized / trackable / non-serialized by quantity) ─────

export const accessoryItems = sqliteTable("accessory_item", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  category: text("category", {
    enum: ["serialized_asset", "trackable", "non_serialized"],
  }).notNull(),
  requiresSerial: integer("requires_serial", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

export const accessoryUnits = sqliteTable(
  "accessory_unit",
  {
    id: text("id").primaryKey(),
    accessoryItemId: text("accessory_item_id")
      .notNull()
      .references(() => accessoryItems.id),
    serialNumber: text("serial_number"),
    status: text("status", {
      enum: ["in_stock", "assigned", "returned", "missing", "damaged", "retired"],
    })
      .notNull()
      .default("in_stock"),
    location: text("location").notNull().default("main_warehouse"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("accessory_unit_item_idx").on(t.accessoryItemId)]
)

export const accessoryStock = sqliteTable(
  "accessory_stock",
  {
    id: text("id").primaryKey(),
    accessoryItemId: text("accessory_item_id")
      .notNull()
      .references(() => accessoryItems.id),
    location: text("location").notNull().default("main_warehouse"),
    qty: integer("qty").notNull().default(0),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("accessory_stock_item_location_idx").on(t.accessoryItemId, t.location)]
)

export const accessoryAttachments = sqliteTable(
  "accessory_attachment",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type", { enum: ["request", "asset"] }).notNull(),
    entityId: text("entity_id").notNull(),
    accessoryItemId: text("accessory_item_id")
      .notNull()
      .references(() => accessoryItems.id),
    accessoryUnitId: text("accessory_unit_id").references(() => accessoryUnits.id, {
      onDelete: "set null",
    }),
    qty: integer("qty"),
    checklistState: text("checklist_state", {
      enum: ["delivered", "collected", "missing", "damaged"],
    })
      .notNull()
      .default("delivered"),
    notes: text("notes"),
    byUserId: text("by_user_id"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("accessory_attachment_entity_idx").on(t.entityType, t.entityId)]
)

// ─── Maintenance orders (work orders for an asset's repair cycle) ───────────
// Distinct from a raw asset_event: this tracks an open issue through to
// resolution with a cost, not just a single status flip.

export const maintenanceOrders = sqliteTable(
  "maintenance_order",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => orderUnits.id, { onDelete: "cascade" }),
    issue: text("issue").notNull(),
    status: text("status", {
      enum: ["open", "in_progress", "done", "cancelled"],
    })
      .notNull()
      .default("open"),
    cost: real("cost"),
    vendorNotes: text("vendor_notes"),
    openedBy: text("opened_by").references(() => users.id),
    openedAt: integer("opened_at").notNull().$defaultFn(now),
    closedAt: integer("closed_at"),
  },
  (t) => [
    index("maintenance_order_asset_idx").on(t.assetId),
    index("maintenance_order_status_idx").on(t.status),
  ]
)

// ─── Customer portal (magic-link, read-mostly view of a customer's assets) ──

export const customerPortalTokens = sqliteTable("customer_portal_token", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .unique()
    .references(() => customers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

export const customerCallbackRequests = sqliteTable(
  "customer_callback_request",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    requestId: text("request_id"),
    kind: text("kind", { enum: ["return", "extension", "issue"] }).notNull(),
    message: text("message"),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("customer_callback_customer_idx").on(t.customerId)]
)

// ─── Domain events (transactional outbox, OI-2) ──────────────────────────────
// One row per business-significant event, written in the SAME transaction as
// the state change it describes. dedupeKey enforces idempotent emit (a retry
// of the same business operation must not create a second event row).

export const domainEvents = sqliteTable(
  "domain_event",
  {
    id: text("id").primaryKey(),
    aggregateType: text("aggregate_type").notNull(), // e.g. "asset", "request", "task", "signature_request", "payment_batch", "partner_payment"
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(), // e.g. "AssetDelivered", "RequestCreated"
    payload: text("payload").notNull(), // JSON
    dedupeKey: text("dedupe_key").notNull().unique(),
    actorUserId: text("actor_user_id"),
    occurredAt: integer("occurred_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("domain_event_aggregate_idx").on(t.aggregateType, t.aggregateId),
    index("domain_event_type_idx").on(t.eventType),
  ]
)

// ─── Event deliveries (per-consumer outbox rows) ─────────────────────────────
// One row per (event, consumer). The cron drain claims pending rows, invokes
// the consumer, and advances status. A unique index on (eventId, consumer)
// makes emit idempotent per consumer even if emitDomainEvent were ever called
// twice for the same dedupeKey (it won't insert a second domain_event, but
// this also guards the delivery fan-out itself).

export const eventDeliveries = sqliteTable(
  "event_delivery",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => domainEvents.id, { onDelete: "cascade" }),
    consumer: text("consumer", { enum: ["projections", "notifications", "notion"] }).notNull(),
    status: text("status", { enum: ["pending", "delivered", "failed", "dead"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull().$defaultFn(now),
    lastError: text("last_error"),
    deliveredAt: integer("delivered_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("event_delivery_event_consumer_idx").on(t.eventId, t.consumer),
    index("event_delivery_status_next_idx").on(t.status, t.nextAttemptAt),
  ]
)

export type DomainEvent = typeof domainEvents.$inferSelect
export type NewDomainEvent = typeof domainEvents.$inferInsert
export type EventDelivery = typeof eventDeliveries.$inferSelect
export type NewEventDelivery = typeof eventDeliveries.$inferInsert

export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderLine = typeof orderLines.$inferSelect
export type NewOrderLine = typeof orderLines.$inferInsert
export type OrderUnit = typeof orderUnits.$inferSelect
export type NewOrderUnit = typeof orderUnits.$inferInsert
export type SupplierReturn = typeof supplierReturns.$inferSelect
export type NewSupplierReturn = typeof supplierReturns.$inferInsert
export type MaintenanceOrder = typeof maintenanceOrders.$inferSelect
export type NewMaintenanceOrder = typeof maintenanceOrders.$inferInsert

export type PurchaseOrder = typeof purchaseOrders.$inferSelect
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect
export type NewPurchaseOrderLine = typeof purchaseOrderLines.$inferInsert
export type WarrantyProduct = typeof warrantyProducts.$inferSelect
export type NewWarrantyProduct = typeof warrantyProducts.$inferInsert
export type WarrantyBatch = typeof warrantyBatches.$inferSelect
export type NewWarrantyBatch = typeof warrantyBatches.$inferInsert
export type WarrantyAssignment = typeof warrantyAssignments.$inferSelect
export type NewWarrantyAssignment = typeof warrantyAssignments.$inferInsert
export type AccessoryItem = typeof accessoryItems.$inferSelect
export type NewAccessoryItem = typeof accessoryItems.$inferInsert
export type AccessoryUnit = typeof accessoryUnits.$inferSelect
export type NewAccessoryUnit = typeof accessoryUnits.$inferInsert
export type AccessoryStock = typeof accessoryStock.$inferSelect
export type NewAccessoryStock = typeof accessoryStock.$inferInsert
export type AccessoryAttachment = typeof accessoryAttachments.$inferSelect
export type NewAccessoryAttachment = typeof accessoryAttachments.$inferInsert
