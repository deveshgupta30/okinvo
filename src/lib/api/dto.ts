import { z } from "zod";

/**
 * Public shapes of the versioned API (spec §7.2). Each schema is parsed over the DAL DTO, so
 * anything not listed here (snapshots, verification tokens, encrypted details, template config)
 * never leaves the server. Task 31 annotates them for the OpenAPI document.
 */
const money = z.string();
const date = z.string();
const instant = z.string();
const nullable = <T extends z.ZodType>(s: T) => s.nullable();

export const AddressOutSchema = z.object({
  line1: z.string(),
  line2: z.string().nullish(),
  city: z.string(),
  state: z.string().nullish(),
  postalCode: z.string().nullish(),
  countryCode: z.string(),
});

export const InvoiceItemSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  serviceItemId: nullable(z.string()),
  productId: nullable(z.string()),
  sku: nullable(z.string()),
  description: z.string(),
  sacHsnCode: nullable(z.string()),
  unitType: z.enum(["HOUR", "DAY", "FIXED", "MILESTONE", "UNIT"]),
  quantity: money,
  unitPrice: money,
  lineSubtotal: money,
  taxRate: money,
  taxExempt: z.boolean(),
  taxAmount: money,
  lineTotal: money,
});

export const TaxLineSchema = z.object({
  taxType: z.enum(["CGST", "SGST", "IGST", "VAT", "SALES_TAX", "OTHER"]),
  rate: money,
  taxableAmount: money,
  taxAmount: money,
});

export const DocumentRefSchema = z.object({
  id: z.string(),
  format: z.enum(["PDF", "DOCX", "PDF_PROTECTED", "PDF_A3"]),
  version: z.number().int(),
  sha256: z.string(),
  byteSize: z.number().int(),
  generatedAt: instant,
});

export const INVOICE_DISPLAY_STATUSES = [
  "DRAFT",
  "ISSUED",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
] as const;

export const InvoiceListItemSchema = z.object({
  id: z.string(),
  status: z.enum(["DRAFT", "ISSUED", "VOID"]),
  displayStatus: z.enum(INVOICE_DISPLAY_STATUSES),
  number: nullable(z.string()),
  issueDate: date,
  dueDate: date,
  currency: z.string(),
  total: money,
  balanceDue: money,
  clientId: z.string(),
  clientName: z.string(),
  issuerProfileId: z.string(),
  issuerLabel: z.string(),
  locale: z.string(),
  sentAt: nullable(instant),
});

export const InvoiceSchema = InvoiceListItemSchema.extend({
  fiscalYear: nullable(z.string()),
  sequenceNumber: nullable(z.number().int()),
  issuedAt: nullable(instant),
  voidedAt: nullable(instant),
  voidReason: nullable(z.string()),
  replacesInvoiceId: nullable(z.string()),
  replacedById: nullable(z.string()),
  fxRateToBase: money,
  taxRegime: z.enum(["INDIA_GST", "UK_VAT", "US_SALES_TAX", "NONE"]),
  supplyType: z.string(),
  placeOfSupply: nullable(z.string()),
  isReverseCharge: z.boolean(),
  lutNumber: nullable(z.string()),
  subtotal: money,
  discountType: nullable(z.enum(["AMOUNT", "PERCENT"])),
  discountValue: nullable(money),
  discountAmount: money,
  taxableAmount: money,
  taxAmount: money,
  roundingAdjustment: money,
  tdsRate: money,
  tdsExpected: money,
  amountPaid: money,
  amountCredited: money,
  poReference: nullable(z.string()),
  notes: nullable(z.string()),
  terms: nullable(z.string()),
  items: z.array(InvoiceItemSchema),
  taxLines: z.array(TaxLineSchema),
  paymentMethodIds: z.array(z.string()),
  documents: z.array(DocumentRefSchema),
  createdAt: instant.optional(),
  updatedAt: instant.optional(),
});
export type InvoiceOut = z.infer<typeof InvoiceSchema>;

export const CreditNoteListItemSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  status: z.enum(["DRAFT", "ISSUED", "VOID"]),
  displayStatus: z.string(),
  number: nullable(z.string()),
  issueDate: date,
  currency: z.string(),
  locale: z.string(),
  subtotal: money,
  taxAmount: money,
  total: money,
  reason: z.string(),
  invoiceNumber: nullable(z.string()),
  clientId: z.string(),
  clientName: z.string(),
  issuerProfileId: z.string(),
  issuerLabel: z.string(),
});

export const CreditNoteSchema = CreditNoteListItemSchema.extend({
  roundingAdjustment: money,
  fiscalYear: nullable(z.string()),
  sequenceNumber: nullable(z.number().int()),
  issuedAt: nullable(instant),
  sentAt: nullable(instant),
  voidedAt: nullable(instant),
  voidReason: nullable(z.string()),
  supplyType: z.string(),
  taxLines: z.array(TaxLineSchema),
  invoice: z.object({
    id: z.string(),
    number: nullable(z.string()),
    status: z.enum(["DRAFT", "ISSUED", "VOID"]),
    issueDate: date,
    total: money,
    taxableAmount: money,
    balanceDue: money,
    amountCredited: money,
  }),
  documents: z.array(DocumentRefSchema),
  createdAt: instant,
  updatedAt: instant,
});
export type CreditNoteOut = z.infer<typeof CreditNoteSchema>;

export const ClientSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  contactPerson: nullable(z.string()),
  email: nullable(z.string()),
  phone: nullable(z.string()),
  billingAddress: AddressOutSchema,
  shippingAddress: nullable(AddressOutSchema),
  countryCode: z.string(),
  stateCode: nullable(z.string()),
  gstStateCode: nullable(z.string()),
  taxIdType: nullable(z.enum(["GSTIN", "VAT", "EIN", "OTHER"])),
  taxId: nullable(z.string()),
  currency: z.string(),
  paymentTermsDays: z.number().int(),
  defaultTdsRate: nullable(money),
  notes: nullable(z.string()),
  archivedAt: nullable(instant),
  createdAt: instant,
  updatedAt: instant,
});

/** Issuer profile without personal tax ids, mail defaults, template config and asset keys. */
export const ProfilePublicSchema = z.object({
  id: z.string(),
  type: z.enum(["INDIVIDUAL", "COMPANY"]),
  isDefault: z.boolean(),
  label: z.string(),
  legalName: z.string(),
  tradeName: nullable(z.string()),
  email: z.string(),
  phone: nullable(z.string()),
  website: nullable(z.string()),
  address: AddressOutSchema,
  countryCode: z.string(),
  stateCode: nullable(z.string()),
  gstStateCode: nullable(z.string()),
  gstin: nullable(z.string()),
  cinNumber: nullable(z.string()),
  ukVatNumber: nullable(z.string()),
  lutNumber: nullable(z.string()),
  lutFiscalYear: nullable(z.string()),
  baseCurrency: z.string(),
  locale: z.string(),
  fiscalYearStartMonth: z.number().int(),
  invoiceNumberFormat: z.string(),
  creditNoteNumberFormat: z.string(),
  defaultTaxRegime: z.enum(["INDIA_GST", "UK_VAT", "US_SALES_TAX", "NONE"]),
  defaultTdsRate: nullable(money),
  defaultNotes: nullable(z.string()),
  defaultTerms: nullable(z.string()),
  archivedAt: nullable(instant),
});

export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: nullable(z.string()),
  unitType: z.enum(["HOUR", "DAY", "FIXED", "MILESTONE", "UNIT"]),
  defaultRate: money,
  currency: z.string(),
  sacHsnCode: nullable(z.string()),
  defaultTaxRate: money,
  isActive: z.boolean(),
  issuerProfileIds: z.array(z.string()),
  archivedAt: nullable(instant),
  createdAt: instant,
  updatedAt: instant,
});

export const ProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  description: nullable(z.string()),
  unitType: z.enum(["HOUR", "DAY", "FIXED", "MILESTONE", "UNIT"]),
  unitPrice: money,
  currency: z.string(),
  hsnCode: nullable(z.string()),
  defaultTaxRate: money,
  isActive: z.boolean(),
  issuerProfileIds: z.array(z.string()),
  archivedAt: nullable(instant),
  createdAt: instant,
  updatedAt: instant,
});

/** Payment method without its (encrypted) details. */
export const PaymentMethodPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  currency: nullable(z.string()),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  instructions: nullable(z.string()),
  archivedAt: nullable(instant),
  createdAt: instant,
  updatedAt: instant,
});

const health = z.enum(["ok", "warning", "failed", "n/a"]);
export const StatusSchema = z.object({
  overall: z.enum(["ok", "degraded", "failed"]),
  checkedAt: instant,
  version: z.object({
    app: z.string(),
    sha: nullable(z.string()),
    builtAt: nullable(z.string()),
    node: z.string(),
  }),
  uptimeSeconds: z.number(),
  db: z.object({
    health,
    latencyMs: nullable(z.number()),
    lastMigration: nullable(z.object({ name: z.string(), finishedAt: z.string() })),
    pending: z.number().int(),
  }),
  storage: z.object({ health, driver: z.enum(["local", "s3"]), latencyMs: nullable(z.number()) }),
  rateLimitStore: z.enum(["memory", "postgres"]),
  smtp: z.object({
    health,
    configured: z.boolean(),
    source: nullable(z.enum(["settings", "env"])),
    lastTestAt: nullable(z.string()),
  }),
  backups: z.object({ health }),
  email24h: z.object({ sent: z.number().int(), failed: z.number().int() }),
});

/** Request bodies. */
export const CreateCreditNoteBodySchema = z.object({
  invoiceId: z.string().min(1),
  subtotal: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  issueDate: z.string().optional(),
});
