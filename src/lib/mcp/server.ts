import "server-only";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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
} from "@/lib/api/dto";
import { documentBytes, draftCreditNoteFromBody, draftInvoiceFromBody } from "@/lib/api/handlers";
import { CreditNoteCreateBody, InvoiceCreateBody } from "@/lib/api/openapi";
import { MAX_LIMIT, paginate } from "@/lib/api/pagination";
import type { Scope } from "@/lib/api/scopes";
import { InputCharsetError } from "@/lib/input-charset";
import { StorageNotFoundError } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import type { Actor } from "@/server/actor";
import { listClients } from "@/server/dal/clients";
import { getCreditNote, issueCreditNote, listCreditNotes } from "@/server/dal/credit-notes";
import { isDalError, NotFoundError } from "@/server/dal/errors";
import { getInvoice, issueInvoice, listInvoices } from "@/server/dal/invoices";
import { listPaymentMethods } from "@/server/dal/payment-methods";
import { listProducts } from "@/server/dal/products";
import { listProfiles } from "@/server/dal/profiles";
import { listServices } from "@/server/dal/services";
import { collectStatus } from "@/server/status";

/**
 * The MCP server (spec §7.4): one instance per request, built for the calling actor with only
 * the tools its scopes allow, so an agent holding a read-only key never even sees
 * `create_invoice`. Tool inputs are the REST payload schemas; outputs are the REST DTOs.
 * There are no delete, void, payment or settings tools, and the SDK answers any other tool name
 * with a JSON-RPC "invalid params" error.
 */
export const MCP_INSTRUCTIONS = [
  "okinvo is a self-hosted invoicing app. Use list_profiles and list_clients to find the ids",
  "an invoice needs, create_invoice to save a draft, then issue_invoice to allocate its number",
  "and freeze it; the issued PDF is the resource okinvo://invoices/{id}/pdf (base64).",
  "Credit notes work the same way against an issued invoice. Amounts and quantities are",
  "decimal strings, dates are YYYY-MM-DD, and only standard keyboard characters are accepted.",
  "There are no delete, void, payment or settings tools: corrections are made by a person in",
  "the app through void / re-issue or a credit note, and payments are recorded there too.",
].join(" ");

const id = z.string().min(1).max(64);
const page = {
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  cursor: z.string().max(64).optional(),
};

function json(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function failure(code: string, message: string, issues?: { path: string; message: string }[]) {
  const text = issues?.length
    ? `${code}: ${message}\n${issues.map((i) => `- ${i.path || "(body)"}: ${i.message}`).join("\n")}`
    : `${code}: ${message}`;
  return { content: [{ type: "text" as const, text }], isError: true } satisfies CallToolResult;
}

/**
 * DAL and validation failures become in-band tool errors with their code; anything else is a
 * server fault reported without its message (the SDK would otherwise echo it to the client).
 */
async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InputCharsetError) {
      return failure("bad_charset", e.message);
    }
    if (e instanceof NotFoundError || e instanceof StorageNotFoundError) {
      return failure("not_found", "Not found.");
    }
    if (isDalError(e)) {
      return failure(
        e.code,
        e.message,
        Object.entries(e.fieldErrors ?? {}).flatMap(([path, messages]) =>
          messages.map((message) => ({ path, message })),
        ),
      );
    }
    console.error("mcp tool failed", e);
    return failure("internal", "Something went wrong.");
  }
}

function pageOf<T extends { id: string }>(
  rows: readonly T[],
  o: { limit?: number | undefined; cursor?: string | undefined },
  parse: (row: T) => unknown,
) {
  const p = paginate(rows, o);
  return { data: p.items.map(parse), nextCursor: p.nextCursor };
}

export function buildMcpServer(actor: Actor, scopes: readonly Scope[]): McpServer {
  const server = new McpServer(
    { name: "okinvo", version: APP_VERSION },
    { instructions: MCP_INSTRUCTIONS },
  );
  const has = (s: Scope) => scopes.includes(s);
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  const creates = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

  if (has("invoices:read")) {
    server.registerTool(
      "list_invoices",
      {
        title: "List invoices",
        description:
          "The invoice register, newest first, with the same filters as the app: status, issuer profile, client, fiscal year, date range, currency, free text.",
        inputSchema: {
          status: z
            .enum(["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"])
            .optional(),
          issuerProfileId: id.optional(),
          clientId: id.optional(),
          fy: z
            .string()
            .regex(/^\d{4}(-\d{2})?$/)
            .optional(),
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          currency: z.string().length(3).optional(),
          q: z.string().trim().max(80).optional(),
          ...page,
        },
        annotations: readOnly,
      },
      ({ limit, cursor, ...filters }) =>
        guarded(async () =>
          json(
            pageOf(await listInvoices(actor, filters), { limit, cursor }, (r) =>
              InvoiceListItemSchema.parse(r),
            ),
          ),
        ),
    );
    server.registerTool(
      "get_invoice",
      {
        title: "Get an invoice",
        description: "One invoice with its items, tax lines, payments, credit notes and documents.",
        inputSchema: { id },
        annotations: readOnly,
      },
      ({ id }) => guarded(async () => json(InvoiceSchema.parse(await getInvoice(actor, id)))),
    );
  }

  if (has("invoices:create")) {
    server.registerTool(
      "create_invoice",
      {
        title: "Create a draft invoice",
        description:
          "Saves a draft. The display configuration defaults from the issuer profile. Nothing is numbered or frozen until issue_invoice.",
        inputSchema: InvoiceCreateBody.shape,
        annotations: creates,
      },
      (body) =>
        guarded(async () => {
          const draft = await draftInvoiceFromBody(actor, body);
          if (!draft.ok) return failure("validation", "The input did not validate.", draft.issues);
          return json(InvoiceSchema.parse(draft.dto));
        }),
    );
    server.registerTool(
      "issue_invoice",
      {
        title: "Issue an invoice",
        description:
          "Allocates the next number, freezes the draft and renders its PDF. Irreversible: an issued invoice can only be voided by a person in the app.",
        inputSchema: { id },
        annotations: creates,
      },
      ({ id }) => guarded(async () => json(InvoiceSchema.parse(await issueInvoice(actor, id)))),
    );
  }

  if (has("credit_notes:read")) {
    server.registerTool(
      "list_credit_notes",
      {
        title: "List credit notes",
        description:
          "Credit notes, newest first, filterable by status, issuer, client, invoice and dates.",
        inputSchema: {
          status: z.enum(["DRAFT", "ISSUED", "VOID"]).optional(),
          issuerProfileId: id.optional(),
          clientId: id.optional(),
          invoiceId: id.optional(),
          fy: z
            .string()
            .regex(/^\d{4}(-\d{2})?$/)
            .optional(),
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          ...page,
        },
        annotations: readOnly,
      },
      ({ limit, cursor, ...filters }) =>
        guarded(async () =>
          json(
            pageOf(await listCreditNotes(actor, filters), { limit, cursor }, (r) =>
              CreditNoteListItemSchema.parse(r),
            ),
          ),
        ),
    );
    server.registerTool(
      "get_credit_note",
      {
        title: "Get a credit note",
        description: "One credit note with its tax lines and documents.",
        inputSchema: { id },
        annotations: readOnly,
      },
      ({ id }) => guarded(async () => json(CreditNoteSchema.parse(await getCreditNote(actor, id)))),
    );
  }

  if (has("credit_notes:create")) {
    server.registerTool(
      "create_credit_note",
      {
        title: "Create a draft credit note",
        description:
          "A draft credit note against an issued invoice for a subtotal (excluding tax) and a reason; the invoice's tax regime applies. Issue it with issue_credit_note.",
        inputSchema: CreditNoteCreateBody.shape,
        annotations: creates,
      },
      (body) =>
        guarded(async () => {
          const draft = await draftCreditNoteFromBody(actor, body);
          if (!draft.ok) return failure("validation", "The input did not validate.", draft.issues);
          return json(CreditNoteSchema.parse(draft.dto));
        }),
    );
    server.registerTool(
      "issue_credit_note",
      {
        title: "Issue a credit note",
        description:
          "Allocates the number, freezes the credit note and renders its PDF. Irreversible.",
        inputSchema: { id },
        annotations: creates,
      },
      ({ id }) =>
        guarded(async () => json(CreditNoteSchema.parse(await issueCreditNote(actor, id)))),
    );
  }

  if (has("catalogue:read")) {
    server.registerTool(
      "list_clients",
      {
        title: "List clients",
        description: "Clients with their billing address, currency and payment terms.",
        inputSchema: {
          q: z.string().trim().max(80).optional(),
          includeArchived: z.boolean().optional(),
          ...page,
        },
        annotations: readOnly,
      },
      ({ q, includeArchived, limit, cursor }) =>
        guarded(async () =>
          json(
            pageOf(
              await listClients(actor, {
                ...(q ? { q } : {}),
                ...(includeArchived ? { includeArchived: true } : {}),
              }),
              { limit, cursor },
              (r) => ClientSchema.parse(r),
            ),
          ),
        ),
    );
    server.registerTool(
      "list_profiles",
      {
        title: "List issuer profiles",
        description:
          "The issuer profiles (the businesses that invoice) without tax ids, mail defaults or template settings.",
        inputSchema: { includeArchived: z.boolean().optional() },
        annotations: readOnly,
      },
      ({ includeArchived }) =>
        guarded(async () =>
          json({
            data: (await listProfiles(actor, includeArchived ? { includeArchived: true } : {})).map(
              (r) => ProfilePublicSchema.parse(r),
            ),
          }),
        ),
    );
    server.registerTool(
      "list_catalogue",
      {
        title: "List services, products and payment methods",
        description:
          "Services and products (optionally only those offered to one issuer profile) and the payment methods by name and type, never their details.",
        inputSchema: {
          issuerProfileId: id.optional(),
          includeArchived: z.boolean().optional(),
        },
        annotations: readOnly,
      },
      ({ issuerProfileId, includeArchived }) =>
        guarded(async () => {
          const o = {
            ...(includeArchived ? { includeArchived: true } : {}),
            ...(issuerProfileId ? { forIssuerProfileId: issuerProfileId } : {}),
          };
          const [services, products, paymentMethods] = await Promise.all([
            listServices(actor, o),
            listProducts(actor, o),
            listPaymentMethods(actor, includeArchived ? { includeArchived: true } : {}),
          ]);
          return json({
            services: services.map((r) => ServiceSchema.parse(r)),
            products: products.map((r) => ProductSchema.parse(r)),
            paymentMethods: paymentMethods.map((r) => PaymentMethodPublicSchema.parse(r)),
          });
        }),
    );
  }

  if (has("status:read")) {
    server.registerTool(
      "get_status",
      {
        title: "Instance status",
        description: "Database, storage, SMTP, backup and build information of this instance.",
        annotations: readOnly,
      },
      () => guarded(async () => json(StatusSchema.parse(await collectStatus()))),
    );
  }

  if (has("documents:read")) {
    for (const [name, kind, prefix] of [
      ["invoice-pdf", "INVOICE", "invoices"],
      ["credit-note-pdf", "CREDIT_NOTE", "credit-notes"],
    ] as const) {
      server.registerResource(
        name,
        new ResourceTemplate(`okinvo://${prefix}/{id}/pdf`, { list: undefined }),
        {
          title: kind === "INVOICE" ? "Invoice PDF" : "Credit note PDF",
          description: `The stored PDF of an issued ${kind === "INVOICE" ? "invoice" : "credit note"}, base64-encoded.`,
          mimeType: "application/pdf",
        },
        async (uri, variables) => {
          const docId = String(variables.id ?? "");
          try {
            const { document, bytes } = await documentBytes(actor, kind, docId, "PDF");
            return {
              contents: [
                {
                  uri: uri.href,
                  name: document.filename,
                  mimeType: "application/pdf",
                  blob: bytes.toString("base64"),
                },
              ],
            };
          } catch (e) {
            if (e instanceof NotFoundError || e instanceof StorageNotFoundError) {
              throw new McpError(ErrorCode.InvalidParams, `Resource ${uri.href} not found`);
            }
            if (isDalError(e)) throw new McpError(ErrorCode.InvalidParams, e.message);
            throw e;
          }
        },
      );
    }
  }

  return server;
}
