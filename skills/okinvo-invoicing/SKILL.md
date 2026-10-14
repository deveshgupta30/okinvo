---
name: okinvo-invoicing
description: Work with a self-hosted okinvo instance (invoices, credit notes, clients, catalogue, PDFs) through its REST API or MCP server using an API key. Use when asked to list, find, create or issue invoices or credit notes, fetch an invoice PDF, or look up a client, issuer profile, service or product in okinvo. Cannot delete, void, record payments or change settings.
---

# okinvo invoicing

okinvo is a self-hosted invoicing app. An instance exposes the same capability two ways:

- **REST** at `https://<host>/api/v1` (OpenAPI 3.1 at `https://<host>/api/openapi.json`).
- **MCP** at `https://<host>/api/mcp` (Streamable HTTP, stateless, JSON responses).

Both authenticate with an **API key** created by a user at Settings → API. Send it as
`Authorization: Bearer okv_…`. A key carries scopes; anything outside them answers
`403 insufficient_scope` (REST) or is simply not listed as a tool (MCP). Keys are rate-limited to
120 requests per minute.

Prefer the MCP tools when the server is connected (see `docs/mcp.md` in the repository for the
`.mcp.json` snippet). Fall back to REST with `curl` or the generated TypeScript SDK (`sdk/`)
otherwise. `reference.md` beside this file lists every endpoint and tool.

## Rules of the road

- **Amounts, quantities and rates are decimal strings** (`"1500.00"`, `"2"`, `"18"`), never
  numbers. **Dates are `YYYY-MM-DD`** calendar dates. Currencies are ISO 4217 codes.
- **Only standard keyboard characters** (ASCII letters, digits, punctuation, space, newline) are
  accepted in any text; other characters answer `400 bad_charset`.
- **Create, then issue.** `create_invoice` / `POST /invoices` saves a *draft*: nothing is numbered
  or frozen. `issue_invoice` / `POST /invoices/{id}/issue` allocates the number, freezes the
  document and renders its PDF. Issuing is **irreversible** - confirm the draft with the user
  before issuing when anything is uncertain.
- **Ids come from the instance.** Look up `issuerProfileId` with `list_profiles` and `clientId`
  with `list_clients` (search by name with `q`); never invent them.
- **Tax regime** must match the issuer: `INDIA_GST`, `UK_VAT`, `US_SALES_TAX` or `NONE`. The
  profile's `defaultTaxRegime` is the right default. Item `taxRate` is a percent string.
- Lists are cursor-paginated: pass `limit` (1-100) and the returned `nextCursor` back as
  `cursor` until it is `null`.

## Hard limits

There is **no deletion, no voiding, no payment recording and no settings access** through the
API or MCP, with any key. `DELETE`, `PUT` and `PATCH` answer `405`; tool names such as
`delete_invoice`, `void_invoice` or `record_payment` do not exist and are refused. When a user
asks for one of these, say that a person must do it in the app (void / re-issue, credit note,
Payments) and offer the nearest thing you can do, such as drafting a credit note.

## Worked examples

### List unpaid invoices

MCP: `list_invoices` with `{ "status": "OVERDUE" }` (or `"ISSUED"`, `"SENT"`,
`"PARTIALLY_PAID"`). Each row has `number`, `clientName`, `total`, `balanceDue`, `dueDate`.

REST:

```bash
curl -H "Authorization: Bearer $OKINVO_KEY" "https://<host>/api/v1/invoices?status=OVERDUE&limit=50"
```

### Create and issue an invoice for a client

1. `list_profiles` → pick the issuer's `id` (one profile is usually `isDefault: true`).
2. `list_clients` with `{ "q": "Acme" }` → the client's `id` and `currency`.
3. `create_invoice`:

```json
{
  "issuerProfileId": "<profile id>",
  "clientId": "<client id>",
  "issueDate": "2026-10-03",
  "dueDate": "2026-10-18",
  "currency": "INR",
  "taxRegime": "INDIA_GST",
  "items": [
    { "description": "October retainer", "unitType": "FIXED", "quantity": "1", "unitPrice": "50000", "taxRate": "18" }
  ],
  "notes": "Thank you for your business."
}
```

   The result is the draft with its computed `subtotal`, `taxLines` and `total`. Show these to the
   user.
4. `issue_invoice` with `{ "id": "<draft id>" }` → the issued invoice with its `number`.

REST equivalents: `POST /api/v1/invoices` with the same JSON body (`201`, `Location` header),
then `POST /api/v1/invoices/{id}/issue`.

### Fetch the PDF

MCP: read the resource `okinvo://invoices/<id>/pdf` - the content is `application/pdf` as a
base64 `blob`. Credit notes: `okinvo://credit-notes/<id>/pdf`. Both need the `documents:read`
scope.

REST: `GET /api/v1/invoices/{id}/pdf` streams the file (`/docx` for a Word copy).

### Credit a mistake on an issued invoice

`create_credit_note` with `{ "invoiceId": "<issued invoice id>", "subtotal": "5000", "reason": "Overbilled hours" }`
(subtotal excludes tax; the invoice's regime applies), then `issue_credit_note` with its `id`.

## Errors

REST errors are `{ "error": { "code", "message", "issues?" } }` with codes `unauthenticated`,
`insufficient_scope`, `forbidden`, `not_found`, `validation`, `bad_charset`, `conflict`,
`invariant`, `rate_limited`, `method_not_allowed`. MCP tools report the same codes as an in-band
tool error (`isError: true`, text `code: message` plus the field issues). Read the issues back to
the user - they name the field and what was wrong.
