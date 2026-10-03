import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../../sdk/src/client";
import { createInvoice, getStatus, listInvoices } from "../../sdk/src/sdk.gen";

/** The generated SDK (spec §7.3) sends the right URL, query, headers and body. */
describe("generated SDK", () => {
  const calls: { url: string; init: RequestInit & { headers: Headers } }[] = [];
  // the client hands fetch a Request; method, headers and body live on it
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    const method = request.method;
    const headers = new Headers(request.headers);
    const sent = method === "POST" ? await request.text() : undefined;
    calls.push({ url, init: { method, headers, body: sent ?? null } });
    const body = url.includes("/status")
      ? { data: { overall: "ok" } }
      : url.endsWith("/invoices") && method === "POST"
        ? { data: { id: "inv-1", status: "DRAFT" } }
        : { data: [{ id: "inv-1" }], nextCursor: null };
    return new Response(JSON.stringify(body), {
      status: method === "POST" ? 201 : 200,
      headers: { "content-type": "application/json" },
    });
  });

  afterEach(() => {
    calls.length = 0;
    fetchMock.mockClear();
  });

  const client = createClient({
    baseUrl: "https://invoices.example.com/api/v1",
    headers: { Authorization: "Bearer okv_test" },
    fetch: fetchMock as unknown as typeof fetch,
  });

  it("lists invoices with query parameters and the bearer header", async () => {
    const r = await listInvoices({ client, query: { limit: 5, status: "PAID" } });
    expect(r.response.status).toBe(200);
    expect(r.data).toEqual({ data: [{ id: "inv-1" }], nextCursor: null });
    const call = calls[0]!;
    expect(call.url).toBe("https://invoices.example.com/api/v1/invoices?limit=5&status=PAID");
    expect(call.init.headers.get("authorization")).toBe("Bearer okv_test");
  });

  it("posts a JSON body to create an invoice", async () => {
    const r = await createInvoice({
      client,
      body: {
        issuerProfileId: "p1",
        clientId: "c1",
        issueDate: "2026-10-03",
        dueDate: "2026-10-18",
        currency: "INR",
        taxRegime: "NONE",
        items: [{ description: "Work", quantity: "1", unitPrice: "1000" }],
      },
    });
    expect(r.response.status).toBe(201);
    const call = calls[0]!;
    expect(call.url).toBe("https://invoices.example.com/api/v1/invoices");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(String(call.init.body))).toMatchObject({ clientId: "c1", currency: "INR" });
  });

  it("reads the status", async () => {
    const r = await getStatus({ client });
    expect(r.data).toEqual({ data: { overall: "ok" } });
    expect(calls[0]!.url).toBe("https://invoices.example.com/api/v1/status");
  });
});
