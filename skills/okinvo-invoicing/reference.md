# okinvo API and MCP reference

Base: `https://<host>/api/v1`. Auth: `Authorization: Bearer okv_…`. Bodies and responses are
JSON (bodies ≤ 1 MB). The full machine-readable contract is `https://<host>/api/openapi.json`.

## Scopes

| Scope | Allows |
|---|---|
| `invoices:read` | list and read invoices |
| `invoices:create` | create draft invoices and issue them |
| `credit_notes:read` | list and read credit notes |
| `credit_notes:create` | create draft credit notes and issue them |
| `catalogue:read` | clients, issuer profiles, services, products, payment-method names |
| `documents:read` | stored PDFs and DOCX copies |
| `status:read` | the instance status |

A viewer's key can only hold the `:read` scopes.

## REST endpoints

| Method and path | Scope | Notes |
|---|---|---|
| `GET /invoices` | invoices:read | filters `status`, `issuerProfileId`, `clientId`, `fy`, `from`, `to`, `currency`, `q`; `limit`, `cursor` |
| `POST /invoices` | invoices:create | body = `InvoiceCreateInput`; `201` + `Location` |
| `GET /invoices/{id}` | invoices:read | full invoice |
| `POST /invoices/{id}/issue` | invoices:create | numbers, freezes, renders |
| `GET /invoices/{id}/pdf` · `/docx` | documents:read | the stored file |
| `GET /credit-notes` | credit_notes:read | filters `status`, `issuerProfileId`, `clientId`, `invoiceId`, `fy`, `from`, `to` |
| `POST /credit-notes` | credit_notes:create | body `{ invoiceId, subtotal, reason, issueDate? }` |
| `GET /credit-notes/{id}` | credit_notes:read | |
| `POST /credit-notes/{id}/issue` | credit_notes:create | |
| `GET /credit-notes/{id}/pdf` · `/docx` | documents:read | |
| `GET /clients` | catalogue:read | `q`, `includeArchived`, paging |
| `GET /profiles` | catalogue:read | issuer profiles without tax ids, mail defaults or template settings |
| `GET /services` · `/products` | catalogue:read | `q`, `includeArchived`, `issuerProfileId` (only items offered to that issuer) |
| `GET /payment-methods` | catalogue:read | names and types only |
| `GET /status` | status:read | `503` when the instance reports failed |

`DELETE`, `PUT` and `PATCH` anywhere under `/api/v1` or `/api/mcp` answer `405`.

### `InvoiceCreateInput`

```json
{
  "issuerProfileId": "string", "clientId": "string",
  "issueDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD",
  "currency": "INR", "taxRegime": "INDIA_GST | UK_VAT | US_SALES_TAX | NONE",
  "isReverseCharge": false, "fxRateToBase": "1",
  "items": [{ "description": "string", "sacHsnCode": "998314", "unitType": "HOUR | DAY | FIXED | MILESTONE | UNIT",
              "quantity": "2.000", "unitPrice": "1500.00", "taxRate": "18", "taxExempt": false,
              "serviceItemId": "string", "productId": "string" }],
  "discount": { "type": "AMOUNT | PERCENT", "value": "10" },
  "roundingAdjustment": "0.40", "tdsRate": "10",
  "paymentMethodIds": ["string"], "poReference": "string", "notes": "string", "terms": "string"
}
```

Only `issuerProfileId`, `clientId`, `issueDate`, `dueDate`, `currency`, `taxRegime` and `items`
(with `description`, `quantity`, `unitPrice`) are required.

## MCP

Endpoint `POST https://<host>/api/mcp` (Streamable HTTP, stateless; `Accept:
application/json, text/event-stream`). Server name `okinvo`. Tools appear only when the key's
scopes allow them.

| Tool | Scope | Input | Output |
|---|---|---|---|
| `list_invoices` | invoices:read | the `GET /invoices` filters, `limit`, `cursor` | `{ data: InvoiceListItem[], nextCursor }` |
| `get_invoice` | invoices:read | `{ id }` | `Invoice` |
| `create_invoice` | invoices:create | `InvoiceCreateInput` | the draft `Invoice` |
| `issue_invoice` | invoices:create | `{ id }` | the issued `Invoice` |
| `list_credit_notes` | credit_notes:read | the `GET /credit-notes` filters, `limit`, `cursor` | `{ data, nextCursor }` |
| `get_credit_note` | credit_notes:read | `{ id }` | `CreditNote` |
| `create_credit_note` | credit_notes:create | `{ invoiceId, subtotal, reason, issueDate? }` | the draft `CreditNote` |
| `issue_credit_note` | credit_notes:create | `{ id }` | the issued `CreditNote` |
| `list_clients` | catalogue:read | `{ q?, includeArchived?, limit?, cursor? }` | `{ data: Client[], nextCursor }` |
| `list_profiles` | catalogue:read | `{ includeArchived? }` | `{ data: Profile[] }` |
| `list_catalogue` | catalogue:read | `{ issuerProfileId?, includeArchived? }` | `{ services, products, paymentMethods }` |
| `get_status` | status:read | none | `Status` |

Results carry the JSON both as text content and as `structuredContent`. Failures are in-band
(`isError: true`) with `code: message` and one line per field issue.

| Resource | Scope | Content |
|---|---|---|
| `okinvo://invoices/{id}/pdf` | documents:read | `application/pdf`, base64 `blob` |
| `okinvo://credit-notes/{id}/pdf` | documents:read | `application/pdf`, base64 `blob` |

Not available anywhere: delete, void, re-issue, payments, share links, email, settings, users.
