import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

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
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
  deletedAt: integer("deleted_at"),
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
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
})

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
  requestId: text("request_id")
    .notNull()
    .references(() => requests.id),
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
  // Magic link
  taskToken: text("task_token").notNull().unique(),
  taskTokenExpiresAt: integer("task_token_expires_at").notNull(),
  status: text("status", {
    enum: [
      "pending",
      "accepted",
      "in_progress",
      "pending_signoff",
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
  closedBy: text("closed_by").references(() => users.id),
  closedAt: integer("closed_at"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
}, (t) => [
  index("partner_task_request_idx").on(t.requestId),
  index("partner_task_partner_status_idx").on(t.partnerId, t.status),
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
  signatureData: text("signature_data").notNull(), // base64 SVG
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
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
}, (t) => [index("notification_user_idx").on(t.userId, t.readAt)])

// ─── Attachments ─────────────────────────────────────────────────────────────

export const attachments = sqliteTable("attachment", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", {
    enum: ["request", "partner_task", "signature_request"],
  }).notNull(),
  entityId: text("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // Vercel Blob URL
  fileType: text("file_type").notNull(), // image/jpeg | image/png | image/heic
  fileSize: integer("file_size").notNull(), // bytes
  uploadedBy: text("uploaded_by"), // user_id or partner task context
  uploadSource: text("upload_source", { enum: ["admin", "partner_link"] })
    .notNull()
    .default("admin"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
})

// ─── Activity logs (append-only audit trail) ─────────────────────────────────

export const activityLogs = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", {
    enum: ["request", "partner_task", "signature_request", "payment_batch"],
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

// ─── Type exports ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type RequestType = typeof requestTypes.$inferSelect
export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Request = typeof requests.$inferSelect
export type NewRequest = typeof requests.$inferInsert
export type RequestItem = typeof requestItems.$inferSelect
export type Partner = typeof partners.$inferSelect
export type NewPartner = typeof partners.$inferInsert
export type PartnerContract = typeof partnerContracts.$inferSelect
export type PartnerTask = typeof partnerTasks.$inferSelect
export type NewPartnerTask = typeof partnerTasks.$inferInsert
export type ServicesCatalog = typeof servicesCatalog.$inferSelect
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
    orderLineId: text("order_line_id")
      .notNull()
      .references(() => orderLines.id, { onDelete: "cascade" }),
    // Denormalised for easy per-order queries without a join through lines.
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    serialNumber: text("serial_number"),
    supplierId: text("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    purchaseCost: real("purchase_cost"),
    status: text("status", {
      enum: ["in_stock", "assigned", "delivered", "returned", "damaged"],
    })
      .notNull()
      .default("in_stock"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("order_unit_order_idx").on(t.orderId),
    index("order_unit_line_idx").on(t.orderLineId),
    index("order_unit_status_idx").on(t.status),
    index("order_unit_serial_idx").on(t.serialNumber),
  ]
)

export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderLine = typeof orderLines.$inferSelect
export type NewOrderLine = typeof orderLines.$inferInsert
export type OrderUnit = typeof orderUnits.$inferSelect
export type NewOrderUnit = typeof orderUnits.$inferInsert
