# okinvo TypeScript SDK

A typed client for the okinvo REST API v1, generated from `openapi/okinvo.json` with
[@hey-api/openapi-ts](https://heyapi.dev) (`pnpm sdk:generate`). The generated code under
`src/` has no runtime dependency beyond `fetch`.

## Install

The SDK ships inside the repository; copy `sdk/src` into your project (or add this repository as
a git dependency and import from `sdk/src`). Regenerate it from a running instance's own
document at `/api/openapi.json` if you have customised anything.

## Use

```ts
import { createClient } from "./sdk/src/client";
import { createInvoice, getInvoicePdf, issueInvoice, listInvoices } from "./sdk/src/sdk.gen";

const client = createClient({
  baseUrl: "https://invoices.example.com/api/v1",
  headers: { Authorization: `Bearer ${process.env.OKINVO_KEY}` }, // an API key from Settings → API
});

// 1. list the register
const page = await listInvoices({ client, query: { status: "OVERDUE", limit: 20 } });
for (const inv of page.data?.data ?? []) console.log(inv.number, inv.balanceDue);

// 2. draft and issue an invoice
const draft = await createInvoice({
  client,
  body: {
    issuerProfileId: "…",
    clientId: "…",
    issueDate: "2026-10-03",
    dueDate: "2026-10-18",
    currency: "INR",
    taxRegime: "INDIA_GST",
    items: [{ description: "October retainer", quantity: "1", unitPrice: "50000", taxRate: "18" }],
  },
});
const issued = await issueInvoice({ client, path: { id: draft.data!.data.id } });
console.log(issued.data?.data.number);

// 3. download the PDF
const pdf = await getInvoicePdf({ client, path: { id: issued.data!.data.id } });
await Bun.write("invoice.pdf", pdf.data as Blob); // or `fs.writeFile` with Buffer.from(await blob.arrayBuffer())
```

Every call resolves to `{ data, error, response }`: `data` is the `{ data }` or
`{ data, nextCursor }` envelope on success, `error` the `{ error: { code, message, issues } }`
envelope otherwise. Pass `throwOnError: true` to get exceptions instead. Over-limit calls answer
429 with a `Retry-After` header.

Scopes: a key can only call what its scopes allow (`invoices:read`, `invoices:create`,
`credit_notes:read`, `credit_notes:create`, `catalogue:read`, `documents:read`,
`status:read`); the server answers 403 `insufficient_scope` otherwise.
