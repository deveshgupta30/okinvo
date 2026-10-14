import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

/**
 * REST v1 (spec §7.2) through the exported route handlers with real requests: envelopes, scope
 * checks, draft → issue → PDF, catalogue lists and the DTO shapes leaking nothing secret.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const tag = `apiv1-${Date.now()}`;
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

describe.skipIf(!url)("REST API v1", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let storage: typeof import("@/lib/storage").storage;
  let invoices: typeof import("@/app/api/v1/invoices/route");
  let invoice: typeof import("@/app/api/v1/invoices/[id]/route");
  let issue: typeof import("@/app/api/v1/invoices/[id]/issue/route");
  let pdf: typeof import("@/app/api/v1/invoices/[id]/pdf/route");
  let creditNotes: typeof import("@/app/api/v1/credit-notes/route");
  let cnIssue: typeof import("@/app/api/v1/credit-notes/[id]/issue/route");
  let cnPdf: typeof import("@/app/api/v1/credit-notes/[id]/pdf/route");
  let clients: typeof import("@/app/api/v1/clients/route");
  let profiles: typeof import("@/app/api/v1/profiles/route");
  let services: typeof import("@/app/api/v1/services/route");
  let products: typeof import("@/app/api/v1/products/route");
  let methods: typeof import("@/app/api/v1/payment-methods/route");
  let status: typeof import("@/app/api/v1/status/route");
  let fullKey: string;
  let readKey: string;
  let profileId: string;
  let clientId: string;
  const createdInvoices: string[] = [];
  const createdCreditNotes: string[] = [];

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

  const req = (path: string, init: RequestInit & { key?: string | null; json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    if (init.key) headers.set("authorization", `Bearer ${init.key}`);
    if (init.json !== undefined) headers.set("content-type", "application/json");
    return new Request(`${BASE}${path}`, {
      ...init,
      headers,
      ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
    });
  };
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= BASE;
    process.env.AUTH_ALLOWED_EMAILS = `*@example.com,${process.env.AUTH_ALLOWED_EMAILS ?? ""}`;
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    invoices = await import("@/app/api/v1/invoices/route");
    invoice = await import("@/app/api/v1/invoices/[id]/route");
    issue = await import("@/app/api/v1/invoices/[id]/issue/route");
    pdf = await import("@/app/api/v1/invoices/[id]/pdf/route");
    creditNotes = await import("@/app/api/v1/credit-notes/route");
    cnIssue = await import("@/app/api/v1/credit-notes/[id]/issue/route");
    cnPdf = await import("@/app/api/v1/credit-notes/[id]/pdf/route");
    clients = await import("@/app/api/v1/clients/route");
    profiles = await import("@/app/api/v1/profiles/route");
    services = await import("@/app/api/v1/services/route");
    products = await import("@/app/api/v1/products/route");
    methods = await import("@/app/api/v1/payment-methods/route");
    status = await import("@/app/api/v1/status/route");
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
        invoiceNumberFormat: "API/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "APC/{FY}/{SEQ:3}",
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
    const ids = [...createdInvoices];
    const docs = await prisma.document.findMany({
      where: { OR: [{ invoiceId: { in: ids } }, { creditNoteId: { in: createdCreditNotes } }] },
    });
    for (const d of docs) await storage.delete(d.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({
      where: { OR: [{ invoiceId: { in: ids } }, { creditNoteId: { in: createdCreditNotes } }] },
    });
    await prisma.creditNote.deleteMany({ where: { id: { in: createdCreditNotes } } });
    await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
    await prisma.apiKey.deleteMany({ where: { userId: { in: [editorId, viewerId] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [editorId, viewerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [editorId, viewerId] } } });
  });

  const draftBody = () => ({
    issuerProfileId: profileId,
    clientId,
    issueDate: "2026-05-01",
    dueDate: "2026-05-31",
    currency: "INR",
    taxRegime: "NONE",
    items: [
      { description: "API work", unitType: "HOUR", quantity: "2", unitPrice: "1500", taxRate: "0" },
    ],
  });

  it("refuses anonymous and under-scoped calls with the error envelope", async () => {
    const anon = await invoices.GET(req("/api/v1/invoices"), {});
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({
      error: { code: "unauthenticated", message: expect.any(String) },
    });
    const under = await invoices.POST(
      req("/api/v1/invoices", { method: "POST", key: readKey, json: draftBody() }),
      {},
    );
    expect(under.status).toBe(403);
    expect(((await under.json()) as { error: { code: string } }).error.code).toBe(
      "insufficient_scope",
    );
    const bogus = await invoices.GET(req("/api/v1/invoices", { key: "okv_" + "a".repeat(43) }), {});
    expect(bogus.status).toBe(401);
  });

  it("creates a draft (display config from the profile), issues it and streams the PDF", async () => {
    const createRes = await invoices.POST(
      req("/api/v1/invoices", { method: "POST", key: fullKey, json: draftBody() }),
      {},
    );
    expect(createRes.status).toBe(201);
    const createdJson = (await createRes.json()) as { data: Record<string, unknown> };
    const dto = createdJson.data;
    expect(dto.status).toBe("DRAFT");
    expect(dto.total).toBe("3000.00");
    expect(dto).not.toHaveProperty("verificationToken");
    expect(dto).not.toHaveProperty("issuerSnapshot");
    expect(dto).not.toHaveProperty("templateSnapshot");
    expect(createRes.headers.get("location")).toBe(`/api/v1/invoices/${dto.id}`);
    createdInvoices.push(dto.id as string);

    const getRes = await invoice.GET(
      req(`/api/v1/invoices/${dto.id}`, { key: readKey }),
      params(dto.id as string),
    );
    expect(getRes.status).toBe(200);
    const dal = await (await import("@/server/dal/invoices")).getInvoice(editor, dto.id as string);
    expect(((await getRes.json()) as { data: { total: string } }).data.total).toBe(dal.total);

    const issued = await issue.POST(
      req(`/api/v1/invoices/${dto.id}/issue`, { method: "POST", key: fullKey }),
      params(dto.id as string),
    );
    expect(issued.status).toBe(200);
    const issuedJson = (await issued.json()) as { data: { number: string; status: string } };
    expect(issuedJson.data.status).toBe("ISSUED");
    expect(issuedJson.data.number).toMatch(/^API\//);

    const pdfRes = await pdf.GET(
      req(`/api/v1/invoices/${dto.id}/pdf`, { key: fullKey }),
      params(dto.id as string),
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await pdfRes.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    // a read-only key may not issue; documents:read is needed for the PDF
    const forbidden = await issue.POST(
      req(`/api/v1/invoices/${dto.id}/issue`, { method: "POST", key: readKey }),
      params(dto.id as string),
    );
    expect(forbidden.status).toBe(403);
    const noDocs = await pdf.GET(
      req(`/api/v1/invoices/${dto.id}/pdf`, { key: readKey }),
      params(dto.id as string),
    );
    expect(noDocs.status).toBe(403);
  }, 120_000);

  it("validates bodies: bad JSON, wrong content type, schema issues, disallowed characters", async () => {
    const notJson = await invoices.POST(
      new Request(`${BASE}/api/v1/invoices`, {
        method: "POST",
        headers: { authorization: `Bearer ${fullKey}`, "content-type": "application/json" },
        body: "{",
      }),
      {},
    );
    expect(notJson.status).toBe(400);
    const wrongType = await invoices.POST(
      new Request(`${BASE}/api/v1/invoices`, {
        method: "POST",
        headers: { authorization: `Bearer ${fullKey}`, "content-type": "text/plain" },
        body: "x",
      }),
      {},
    );
    expect(wrongType.status).toBe(415);
    const invalid = await invoices.POST(
      req("/api/v1/invoices", {
        method: "POST",
        key: fullKey,
        json: { ...draftBody(), dueDate: "2026-04-01" },
      }),
      {},
    );
    expect(invalid.status).toBe(400);
    const invalidJson = (await invalid.json()) as {
      error: { code: string; issues: { path: string }[] };
    };
    expect(invalidJson.error.code).toBe("validation");
    expect(invalidJson.error.issues.map((i) => i.path)).toContain("dueDate");
    const charset = await invoices.POST(
      req("/api/v1/invoices", {
        method: "POST",
        key: fullKey,
        json: { ...draftBody(), notes: "em — dash" },
      }),
      {},
    );
    expect(charset.status).toBe(400);
    expect(((await charset.json()) as { error: { code: string } }).error.code).toBe("bad_charset");
    const missing = await invoice.GET(
      req("/api/v1/invoices/nope", { key: readKey }),
      params("nope"),
    );
    expect(missing.status).toBe(404);
  });

  it("lists with cursor pagination and filters", async () => {
    const second = await invoices.POST(
      req("/api/v1/invoices", { method: "POST", key: fullKey, json: draftBody() }),
      {},
    );
    createdInvoices.push(((await second.json()) as { data: { id: string } }).data.id);
    const page1 = await invoices.GET(
      req(`/api/v1/invoices?issuerProfileId=${profileId}&limit=1`, { key: readKey }),
      {},
    );
    expect(page1.status).toBe(200);
    const p1 = (await page1.json()) as { data: { id: string }[]; nextCursor: string | null };
    expect(p1.data).toHaveLength(1);
    expect(p1.nextCursor).toBe(p1.data[0]!.id);
    const page2 = await invoices.GET(
      req(`/api/v1/invoices?issuerProfileId=${profileId}&limit=1&cursor=${p1.nextCursor}`, {
        key: readKey,
      }),
      {},
    );
    const p2 = (await page2.json()) as { data: { id: string }[] };
    expect(p2.data[0]!.id).not.toBe(p1.data[0]!.id);
    const badQuery = await invoices.GET(req("/api/v1/invoices?status=WRONG", { key: readKey }), {});
    expect(badQuery.status).toBe(400);
  });

  it("credit notes: draft against the issued invoice, issue, PDF", async () => {
    const invoiceId = createdInvoices[0]!;
    const res = await creditNotes.POST(
      req("/api/v1/credit-notes", {
        method: "POST",
        key: fullKey,
        json: { invoiceId, subtotal: "500", reason: "Partial cancellation" },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const cn = ((await res.json()) as { data: { id: string; status: string; total: string } }).data;
    createdCreditNotes.push(cn.id);
    expect(cn.status).toBe("DRAFT");
    expect(cn.total).toBe("500.00");
    const issued = await cnIssue.POST(
      req(`/api/v1/credit-notes/${cn.id}/issue`, { method: "POST", key: fullKey }),
      params(cn.id),
    );
    expect(issued.status).toBe(200);
    expect(((await issued.json()) as { data: { number: string } }).data.number).toMatch(/^APC\//);
    const pdfRes = await cnPdf.GET(
      req(`/api/v1/credit-notes/${cn.id}/pdf`, { key: fullKey }),
      params(cn.id),
    );
    expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
    const listRes = await creditNotes.GET(
      req(`/api/v1/credit-notes?invoiceId=${invoiceId}`, { key: fullKey }),
      {},
    );
    expect(((await listRes.json()) as { data: { id: string }[] }).data.map((c) => c.id)).toContain(
      cn.id,
    );
  }, 120_000);

  it("catalogue and status endpoints answer with public shapes only", async () => {
    const c = await clients.GET(
      req(`/api/v1/clients?q=${encodeURIComponent(tag)}`, { key: readKey }),
      {},
    );
    expect(c.status).toBe(200);
    expect(((await c.json()) as { data: { id: string }[] }).data.map((x) => x.id)).toContain(
      clientId,
    );
    // the shared dev database holds many profiles from e2e runs: walk the pages to ours
    let cursor: string | null = null;
    let mine: Record<string, unknown> | undefined;
    do {
      const p = await profiles.GET(
        req(`/api/v1/profiles?limit=100${cursor ? `&cursor=${cursor}` : ""}`, { key: readKey }),
        {},
      );
      expect(p.status).toBe(200);
      const pj = (await p.json()) as {
        data: Record<string, unknown>[];
        nextCursor: string | null;
      };
      mine = pj.data.find((x) => x.id === profileId);
      cursor = pj.nextCursor;
    } while (!mine && cursor);
    if (!mine) throw new Error("the test profile is missing from /api/v1/profiles");
    expect(mine.legalName).toBe(`${tag} Person`);
    expect(mine).not.toHaveProperty("panNumber");
    expect(mine).not.toHaveProperty("emailInvoiceBody");
    expect(mine).not.toHaveProperty("templateConfigOverride");
    expect((await services.GET(req("/api/v1/services", { key: readKey }), {})).status).toBe(200);
    expect((await products.GET(req("/api/v1/products", { key: readKey }), {})).status).toBe(200);
    const m = await methods.GET(req("/api/v1/payment-methods", { key: readKey }), {});
    expect(m.status).toBe(200);
    for (const row of ((await m.json()) as { data: Record<string, unknown>[] }).data) {
      expect(row).not.toHaveProperty("details");
      expect(row).not.toHaveProperty("lines");
    }
    const s = await status.GET(req("/api/v1/status", { key: readKey }), {});
    expect([200, 503]).toContain(s.status);
    expect(((await s.json()) as { data: { db: { health: string } } }).data.db.health).toBe("ok");
  }, 60_000);
});
