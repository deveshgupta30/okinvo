import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

/**
 * The MCP endpoint (spec §7.4) driven with JSON-RPC over the route handler: initialize, the
 * scope-filtered tool list, create → issue → PDF resource, the refusal of tools that do not
 * exist, and 405 on DELETE.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const tag = `mcp-${Date.now()}`;
const editorId = `${tag}-editor`;
const viewerId = `${tag}-viewer`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};
const BASE = "http://127.0.0.1:3000";

type Rpc = { jsonrpc: "2.0"; id: number; method: string; params?: unknown };
type RpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

describe.skipIf(!url)("MCP server", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let storage: typeof import("@/lib/storage").storage;
  let route: typeof import("@/app/api/mcp/route");
  let fullKey: string;
  let readKey: string;
  let profileId: string;
  let clientId: string;
  const createdInvoices: string[] = [];
  let seq = 0;

  const editor: Actor = {
    userId: editorId,
    email: `${tag}-editor@example.com`,
    name: "Editor",
    role: "EDITOR",
    timezone: "UTC",
    locale: "en-US",
  };
  const viewer: Actor = {
    userId: viewerId,
    email: `${tag}-viewer@example.com`,
    name: "Viewer",
    role: "VIEWER",
    timezone: "UTC",
    locale: "en-US",
  };

  const post = (key: string | null, body: unknown, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (key) headers.set("authorization", `Bearer ${key}`);
    headers.set("content-type", "application/json");
    headers.set("accept", "application/json, text/event-stream");
    return route.POST(
      new Request(`${BASE}/api/mcp`, { method: "POST", headers, body: JSON.stringify(body) }),
    );
  };
  const rpc = async (key: string | null, method: string, params?: unknown) => {
    const message: Rpc = { jsonrpc: "2.0", id: ++seq, method, ...(params ? { params } : {}) };
    const res = await post(key, message);
    expect(res.status, `${method} status`).toBe(200);
    return (await res.json()) as RpcResponse;
  };
  const call = (key: string, name: string, args: Record<string, unknown> = {}) =>
    rpc(key, "tools/call", { name, arguments: args });
  const toolNames = async (key: string) => {
    const r = await rpc(key, "tools/list");
    expect(r.error).toBeUndefined();
    return ((r.result!.tools as { name: string }[]) ?? []).map((t) => t.name).sort();
  };

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= BASE;
    process.env.AUTH_ALLOWED_EMAILS = `*@example.com,${process.env.AUTH_ALLOWED_EMAILS ?? ""}`;
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    route = await import("@/app/api/mcp/route");
    for (const a of [editor, viewer]) {
      await prisma.user.create({
        data: { id: a.userId, name: a.name, email: a.email, role: a.role, onboardedAt: new Date() },
      });
    }
    const keys = await import("@/server/dal/api-keys");
    fullKey = (
      await keys.createApiKey(editor, {
        name: "full",
        scopes: [...(await import("@/lib/api/scopes")).SCOPES],
      })
    ).key;
    readKey = (
      await keys.createApiKey(viewer, {
        name: "read",
        scopes: ["invoices:read", "catalogue:read", "status:read"],
      })
    ).key;

    const profilesDal = await import("@/server/dal/profiles");
    const clientsDal = await import("@/server/dal/clients");
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profilesDal.createProfile(
      { ...editor, role: "OWNER" },
      ProfileInputSchema.parse({
        type: "INDIVIDUAL",
        label: `${tag} issuer`,
        legalName: `${tag} Person`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        panNumber: "ABCDE1234F",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "MCP/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "MCC/{FY}/{SEQ:3}",
        defaultTaxRegime: "NONE",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault)
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    profileId = p.id;
    const c = await clientsDal.createClient(
      editor,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
        billingAddress: address,
        countryCode: "IN",
        currency: "INR",
        paymentTermsDays: 15,
      }),
    );
    clientId = c.id;
  }, 120_000);

  afterAll(async () => {
    if (!clientId || !profileId) return; // setup failed before the fixtures existed
    const ids = [...createdInvoices];
    const docs = await prisma.document.findMany({ where: { invoiceId: { in: ids } } });
    for (const d of docs) await storage.delete(d.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
    await prisma.apiKey.deleteMany({ where: { userId: { in: [editorId, viewerId] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [editorId, viewerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [editorId, viewerId] } } });
  });

  it("initializes statelessly as okinvo and says what it will not do", async () => {
    const r = await rpc(fullKey, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "0" },
    });
    expect(r.error).toBeUndefined();
    const result = r.result as {
      serverInfo: { name: string; version: string };
      instructions?: string;
    };
    expect(result.serverInfo.name).toBe("okinvo");
    expect(result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.instructions).toMatch(/no .*delete/i);
  });

  it("refuses anonymous and bogus keys before touching the server", async () => {
    const anon = await post(null, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(anon.status).toBe(401);
    const bogus = await post("okv_" + "a".repeat(43), {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(bogus.status).toBe(401);
  });

  it("lists only the tools the key's scopes allow and never a destructive one", async () => {
    const read = await toolNames(readKey);
    expect(read).toContain("list_invoices");
    expect(read).toContain("get_invoice");
    expect(read).toContain("list_clients");
    expect(read).toContain("get_status");
    expect(read).not.toContain("create_invoice");
    expect(read).not.toContain("issue_invoice");
    expect(read).not.toContain("list_credit_notes");

    const full = await toolNames(fullKey);
    expect(full).toEqual(
      [
        "list_invoices",
        "get_invoice",
        "create_invoice",
        "issue_invoice",
        "list_credit_notes",
        "get_credit_note",
        "create_credit_note",
        "issue_credit_note",
        "list_clients",
        "list_profiles",
        "list_catalogue",
        "get_status",
      ].sort(),
    );
    expect(full.filter((n) => /delete|void|payment|setting/.test(n))).toEqual([]);
  });

  it("creates, issues and serves the PDF of an invoice as a resource", async () => {
    const created = await call(fullKey, "create_invoice", {
      issuerProfileId: profileId,
      clientId,
      issueDate: "2026-05-01",
      dueDate: "2026-05-31",
      currency: "INR",
      taxRegime: "NONE",
      items: [
        {
          description: "MCP work",
          unitType: "HOUR",
          quantity: "2",
          unitPrice: "1500",
          taxRate: "0",
        },
      ],
    });
    expect(created.error).toBeUndefined();
    const draft = created.result!.structuredContent as {
      id: string;
      status: string;
      total: string;
    };
    expect(draft.status).toBe("DRAFT");
    expect(draft.total).toBe("3000.00");
    createdInvoices.push(draft.id);

    const issued = await call(fullKey, "issue_invoice", { id: draft.id });
    expect(issued.error).toBeUndefined();
    const dto = issued.result!.structuredContent as { number: string; status: string };
    expect(dto.status).toBe("ISSUED");
    expect(dto.number).toMatch(/^MCP\//);

    const templates = await rpc(fullKey, "resources/templates/list");
    const uris = (templates.result!.resourceTemplates as { uriTemplate: string }[]).map(
      (t) => t.uriTemplate,
    );
    expect(uris).toContain("okinvo://invoices/{id}/pdf");
    expect(uris).toContain("okinvo://credit-notes/{id}/pdf");

    const read = await rpc(fullKey, "resources/read", { uri: `okinvo://invoices/${draft.id}/pdf` });
    expect(read.error).toBeUndefined();
    const contents = read.result!.contents as { uri: string; mimeType: string; blob: string }[];
    expect(contents[0]!.mimeType).toBe("application/pdf");
    expect(contents[0]!.blob.startsWith("JVBERi")).toBe(true);

    // the read-only key sees the invoice but may not fetch documents
    const seen = await call(readKey, "get_invoice", { id: draft.id });
    expect((seen.result!.structuredContent as { number: string }).number).toBe(dto.number);
    const noDocs = await rpc(readKey, "resources/read", {
      uri: `okinvo://invoices/${draft.id}/pdf`,
    });
    // without documents:read no resource capability is advertised at all
    expect(noDocs.error?.code).toBe(-32601);
  }, 120_000);

  it("answers tool errors in-band and refuses unknown or out-of-scope tools", async () => {
    const textOf = (r: RpcResponse) =>
      ((r.result!.content as { type: string; text?: string }[]) ?? []).map((c) => c.text).join(" ");
    const missing = await call(fullKey, "get_invoice", { id: "nope" });
    expect(missing.error).toBeUndefined();
    expect(missing.result!.isError).toBe(true);
    expect(textOf(missing)).toMatch(/not_found/);

    // the SDK answers a name outside the registry as a tool error, never by running anything
    const del = await call(fullKey, "delete_invoice", { id: "x" });
    expect(del.error).toBeUndefined();
    expect(del.result!.isError).toBe(true);
    expect(textOf(del)).toMatch(/delete_invoice not found/);

    const outOfScope = await call(readKey, "create_invoice", { issuerProfileId: profileId });
    expect(outOfScope.result!.isError).toBe(true);
    expect(textOf(outOfScope)).toMatch(/create_invoice not found/);
  });

  it("rejects disallowed characters, oversized bodies and other verbs", async () => {
    const charset = await post(fullKey, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "list_clients", arguments: { q: "café" } },
    });
    expect(charset.status).toBe(400);
    const headers = new Headers({ authorization: `Bearer ${fullKey}` });
    const del = await route.DELETE(new Request(`${BASE}/api/mcp`, { method: "DELETE", headers }));
    expect(del.status).toBe(405);
    const get = await route.GET(new Request(`${BASE}/api/mcp`, { headers }));
    expect(get.status).toBe(405);
  });
});
