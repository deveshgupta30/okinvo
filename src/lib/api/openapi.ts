import { z } from "zod";
import { createDocument, type ZodOpenApiOperationObject } from "zod-openapi";
import { APP_VERSION } from "@/lib/version";
import {
  ClientSchema,
  CreditNoteListItemSchema,
  CreditNoteSchema,
  InvoiceListItemSchema,
  InvoiceSchema,
  PaymentMethodPublicSchema,
  ProductSchema,
  ProfilePublicSchema,
  ServiceSchema,
  StatusSchema,
} from "./dto";
import { SCOPES, type Scope } from "./scopes";

/**
 * The OpenAPI 3.1 document of /api/v1 (spec §7.3), built from the same Zod schemas the handlers
 * parse responses with, so the document cannot drift from the shapes. Request bodies are
 * documented with plain schemas that mirror the validation schemas (decimals travel as strings).
 */
const ErrorEnvelope = z
  .object({
    error: z.object({
      code: z.enum([
        "unauthenticated",
        "forbidden",
        "insufficient_scope",
        "not_found",
        "validation",
        "bad_charset",
        "bad_request",
        "conflict",
        "invariant",
        "rate_limited",
        "method_not_allowed",
        "internal",
      ]),
      message: z.string(),
      issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .meta({ id: "ErrorEnvelope", description: "Every non-2xx response." });

const decimal = (description: string, example: string) =>
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .meta({ description, example });
const dateString = (description: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .meta({ description, example: "2026-10-03" });

export const InvoiceItemBody = z
  .object({
    description: z.string().min(1).max(500),
    sacHsnCode: z.string().max(20).optional(),
    unitType: z.enum(["HOUR", "DAY", "FIXED", "MILESTONE", "UNIT"]).optional(),
    quantity: decimal("Quantity, up to 3 decimals", "2.000"),
    unitPrice: decimal("Unit price in the invoice currency", "1500.00"),
    taxRate: decimal("Percent", "18").optional(),
    taxExempt: z.boolean().optional(),
    serviceItemId: z.string().optional(),
    productId: z.string().optional(),
  })
  .meta({ id: "InvoiceItemInput" });

export const InvoiceCreateBody = z
  .object({
    issuerProfileId: z.string(),
    clientId: z.string(),
    issueDate: dateString("Issue date"),
    dueDate: dateString("Due date, not before the issue date"),
    currency: z.string().length(3).meta({ example: "INR" }),
    taxRegime: z.enum(["INDIA_GST", "UK_VAT", "US_SALES_TAX", "NONE"]),
    isReverseCharge: z.boolean().optional(),
    fxRateToBase: decimal("Rate to the issuer's base currency", "1").optional(),
    items: z.array(InvoiceItemBody).min(1).max(200),
    discount: z
      .object({ type: z.enum(["AMOUNT", "PERCENT"]), value: decimal("Discount", "10") })
      .nullable()
      .optional(),
    roundingAdjustment: decimal("Less than one unit, may be negative", "0.40").optional(),
    tdsRate: decimal("Expected TDS percent", "10").optional(),
    paymentMethodIds: z.array(z.string()).max(10).optional(),
    poReference: z.string().max(80).optional(),
    notes: z.string().max(2000).optional(),
    terms: z.string().max(2000).optional(),
  })
  .meta({
    id: "InvoiceCreateInput",
    description:
      "A draft. The display configuration defaults from the issuer profile. Issue it with POST /invoices/{id}/issue.",
  });

export const CreditNoteCreateBody = z
  .object({
    invoiceId: z.string(),
    subtotal: decimal("Credit amount excluding tax", "500.00"),
    reason: z.string().min(1).max(500),
    issueDate: dateString("Defaults to today in the caller's timezone").optional(),
  })
  .meta({ id: "CreditNoteCreateInput" });

const InvoiceListItem = InvoiceListItemSchema.meta({ id: "InvoiceListItem" });
const CreditNoteListItem = CreditNoteListItemSchema.meta({ id: "CreditNoteListItem" });
const Client = ClientSchema.meta({ id: "Client" });
const Profile = ProfilePublicSchema.meta({ id: "Profile" });
const Service = ServiceSchema.meta({ id: "Service" });
const Product = ProductSchema.meta({ id: "Product" });
const PaymentMethod = PaymentMethodPublicSchema.meta({ id: "PaymentMethod" });
const Status = StatusSchema.meta({ id: "Status" });

// Named once: zod-openapi registers components by id and refuses two schemas with the same id.
const Invoice = InvoiceSchema.meta({ id: "Invoice" });
const InvoiceEnvelope = z.object({ data: Invoice }).meta({ id: "InvoiceEnvelope" });
const CreditNote = CreditNoteSchema.meta({ id: "CreditNote" });
const CreditNoteEnvelope = z.object({ data: CreditNote }).meta({ id: "CreditNoteEnvelope" });
const StatusEnvelope = z.object({ data: Status }).meta({ id: "StatusEnvelope" });

const listEnvelope = <T extends z.ZodType>(item: T, id: string) =>
  z
    .object({
      data: z.array(item),
      nextCursor: z
        .string()
        .nullable()
        .meta({ description: "Pass as `cursor` for the next page." }),
    })
    .meta({ id });

const page = {
  cursor: z.string().optional().meta({ description: "The nextCursor of the previous page." }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .meta({ description: "1–100, default 50." }),
};
const InvoiceListQuery = z.object({
  ...page,
  fy: z
    .string()
    .optional()
    .meta({ description: "Fiscal year label, e.g. 2026-27 (wins over from/to)." }),
  from: dateString("Issue date from").optional(),
  to: dateString("Issue date to").optional(),
  issuerProfileId: z.string().optional(),
  clientId: z.string().optional(),
  status: z
    .enum(["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"])
    .optional(),
  currency: z.string().length(3).optional(),
  q: z.string().max(80).optional().meta({ description: "Number or client name contains." }),
});
const CreditNoteListQuery = z.object({
  ...page,
  fy: z.string().optional(),
  from: dateString("Issue date from").optional(),
  to: dateString("Issue date to").optional(),
  issuerProfileId: z.string().optional(),
  clientId: z.string().optional(),
  invoiceId: z.string().optional(),
  status: z.enum(["DRAFT", "ISSUED", "VOID"]).optional(),
});
const CatalogueQuery = z.object({
  ...page,
  q: z.string().max(80).optional(),
  includeArchived: z.boolean().optional(),
  issuerProfileId: z
    .string()
    .optional()
    .meta({ description: "Services and products offered to this issuer." }),
});
const IdParam = z.object({ id: z.string().meta({ description: "Record id", example: "0199…" }) });

const errors = (codes: number[]) =>
  Object.fromEntries(
    codes.map((c) => [
      String(c),
      {
        description: ERROR_DESCRIPTIONS[c] ?? "Error",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
    ]),
  );
const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Validation or charset failure",
  401: "No or invalid credentials",
  403: "Missing scope or forbidden by role",
  404: "No such record",
  409: "The record's state does not allow this",
  413: "Body too large",
  415: "Send application/json",
  429: "Rate limited; see Retry-After",
};

function op(o: {
  id: string;
  summary: string;
  scope: Scope;
  tag: string;
  params?: { path?: z.ZodType; query?: z.ZodType };
  body?: z.ZodType;
  ok?: { status?: number; schema?: z.ZodType; binary?: string; description?: string };
  extraErrors?: number[];
}): ZodOpenApiOperationObject {
  const status = String(o.ok?.status ?? 200);
  const okResponse = o.ok?.binary
    ? {
        description: o.ok.description ?? "The file",
        content: { [o.ok.binary]: { schema: { type: "string", format: "binary" } } },
      }
    : {
        description: o.ok?.description ?? "OK",
        content: { "application/json": { schema: o.ok?.schema ?? z.object({}) } },
      };
  return {
    operationId: o.id,
    summary: o.summary,
    description: `Scope: \`${o.scope}\`.`,
    tags: [o.tag],
    security: [{ bearerAuth: [o.scope] }],
    ...(o.params ? { requestParams: o.params } : {}),
    ...(o.body
      ? { requestBody: { required: true, content: { "application/json": { schema: o.body } } } }
      : {}),
    responses: {
      [status]: okResponse,
      ...errors([400, 401, 403, 404, 429, ...(o.extraErrors ?? [])]),
    },
  } as ZodOpenApiOperationObject;
}

export function buildOpenApi(appUrl: string) {
  const base = appUrl.replace(/\/$/, "");
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "okinvo API",
      version: APP_VERSION,
      description:
        "Invoices, credit notes, catalogue and status of one okinvo instance. Authenticate with an API key (Settings → API) or a short-lived JWT as `Authorization: Bearer …`. Every operation names the scope it needs. There is no delete or update: corrections are voids, re-issues and credit notes, as in the app.",
    },
    servers: [{ url: `${base}/api/v1`, description: "This instance" }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Invoices" },
      { name: "Credit notes" },
      { name: "Catalogue" },
      { name: "Status" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "okv_… API key or JWT",
          description: `Scopes: ${SCOPES.join(", ")}.`,
        },
      },
    },
    paths: {
      "/invoices": {
        get: op({
          id: "listInvoices",
          summary: "List invoices",
          scope: "invoices:read",
          tag: "Invoices",
          params: { query: InvoiceListQuery },
          ok: { schema: listEnvelope(InvoiceListItem, "InvoiceList") },
        }),
        post: op({
          id: "createInvoice",
          summary: "Create a draft invoice",
          scope: "invoices:create",
          tag: "Invoices",
          body: InvoiceCreateBody,
          ok: { status: 201, schema: InvoiceEnvelope, description: "The draft" },
          extraErrors: [409, 413, 415],
        }),
      },
      "/invoices/{id}": {
        get: op({
          id: "getInvoice",
          summary: "Get an invoice",
          scope: "invoices:read",
          tag: "Invoices",
          params: { path: IdParam },
          ok: { schema: InvoiceEnvelope },
        }),
      },
      "/invoices/{id}/issue": {
        post: op({
          id: "issueInvoice",
          summary: "Issue a draft: allocate its number, freeze it, render the PDF",
          scope: "invoices:create",
          tag: "Invoices",
          params: { path: IdParam },
          ok: { schema: InvoiceEnvelope },
          extraErrors: [409],
        }),
      },
      "/invoices/{id}/pdf": {
        get: op({
          id: "getInvoicePdf",
          summary: "Download the stored PDF",
          scope: "documents:read",
          tag: "Invoices",
          params: { path: IdParam },
          ok: { binary: "application/pdf" },
          extraErrors: [409],
        }),
      },
      "/invoices/{id}/docx": {
        get: op({
          id: "getInvoiceDocx",
          summary: "Download the DOCX copy",
          scope: "documents:read",
          tag: "Invoices",
          params: { path: IdParam },
          ok: { binary: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          extraErrors: [409],
        }),
      },
      "/credit-notes": {
        get: op({
          id: "listCreditNotes",
          summary: "List credit notes",
          scope: "credit_notes:read",
          tag: "Credit notes",
          params: { query: CreditNoteListQuery },
          ok: { schema: listEnvelope(CreditNoteListItem, "CreditNoteList") },
        }),
        post: op({
          id: "createCreditNote",
          summary: "Create a draft credit note against an issued invoice",
          scope: "credit_notes:create",
          tag: "Credit notes",
          body: CreditNoteCreateBody,
          ok: { status: 201, schema: CreditNoteEnvelope, description: "The draft" },
          extraErrors: [409, 413, 415],
        }),
      },
      "/credit-notes/{id}": {
        get: op({
          id: "getCreditNote",
          summary: "Get a credit note",
          scope: "credit_notes:read",
          tag: "Credit notes",
          params: { path: IdParam },
          ok: { schema: CreditNoteEnvelope },
        }),
      },
      "/credit-notes/{id}/issue": {
        post: op({
          id: "issueCreditNote",
          summary: "Issue a draft credit note",
          scope: "credit_notes:create",
          tag: "Credit notes",
          params: { path: IdParam },
          ok: { schema: CreditNoteEnvelope },
          extraErrors: [409],
        }),
      },
      "/credit-notes/{id}/pdf": {
        get: op({
          id: "getCreditNotePdf",
          summary: "Download the stored PDF",
          scope: "documents:read",
          tag: "Credit notes",
          params: { path: IdParam },
          ok: { binary: "application/pdf" },
          extraErrors: [409],
        }),
      },
      "/credit-notes/{id}/docx": {
        get: op({
          id: "getCreditNoteDocx",
          summary: "Download the DOCX copy",
          scope: "documents:read",
          tag: "Credit notes",
          params: { path: IdParam },
          ok: { binary: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          extraErrors: [409],
        }),
      },
      "/clients": {
        get: op({
          id: "listClients",
          summary: "List clients",
          scope: "catalogue:read",
          tag: "Catalogue",
          params: { query: CatalogueQuery },
          ok: { schema: listEnvelope(Client, "ClientList") },
        }),
      },
      "/profiles": {
        get: op({
          id: "listProfiles",
          summary: "List issuer profiles (public fields)",
          scope: "catalogue:read",
          tag: "Catalogue",
          params: { query: CatalogueQuery },
          ok: { schema: listEnvelope(Profile, "ProfileList") },
        }),
      },
      "/services": {
        get: op({
          id: "listServices",
          summary: "List services",
          scope: "catalogue:read",
          tag: "Catalogue",
          params: { query: CatalogueQuery },
          ok: { schema: listEnvelope(Service, "ServiceList") },
        }),
      },
      "/products": {
        get: op({
          id: "listProducts",
          summary: "List products",
          scope: "catalogue:read",
          tag: "Catalogue",
          params: { query: CatalogueQuery },
          ok: { schema: listEnvelope(Product, "ProductList") },
        }),
      },
      "/payment-methods": {
        get: op({
          id: "listPaymentMethods",
          summary: "List payment methods (no details)",
          scope: "catalogue:read",
          tag: "Catalogue",
          params: { query: CatalogueQuery },
          ok: { schema: listEnvelope(PaymentMethod, "PaymentMethodList") },
        }),
      },
      "/status": {
        get: op({
          id: "getStatus",
          summary: "Instance status",
          scope: "status:read",
          tag: "Status",
          ok: { schema: StatusEnvelope },
          extraErrors: [503],
        }),
      },
    },
  });
}
