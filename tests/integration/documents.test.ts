import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import type { Actor } from "@/server/actor";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const actor: Actor = {
  userId: "no-such-user",
  email: "owner@example.com",
  name: "Owner",
  role: "OWNER",
  timezone: "Asia/Kolkata",
  locale: "en-US",
};
const tag = `doc-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("documents DAL", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let docs: typeof import("@/server/dal/documents");
  let inv: typeof import("@/server/dal/invoices");
  let storage: typeof import("@/lib/storage").storage;
  let profileId: string;
  let clientId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    docs = await import("@/server/dal/documents");
    inv = await import("@/server/dal/invoices");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "COMPANY",
        label: `${tag} issuer`,
        legalName: `${tag} Studio LLP`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        gstin: "29ABCDE1234F1Z5",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "DOC/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault)
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    profileId = p.id;
    const c = await clients.createClient(
      actor,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
        billingAddress: address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        currency: "INR",
        paymentTermsDays: 15,
      }),
    );
    clientId = c.id;
  });

  afterAll(async () => {
    const rows = await prisma.document.findMany({ where: { invoiceId: { in: invoiceIds } } });
    for (const r of rows) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  const draft = () =>
    inv.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-05-01",
        dueDate: "2027-03-31",
        currency: "INR",
        taxRegime: "INDIA_GST",
        items: [
          {
            description: "Work",
            sacHsnCode: "998314",
            unitType: "HOUR",
            quantity: "1",
            unitPrice: "1000",
            taxRate: "18",
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );

  it("refuses to store a draft but previews it with a watermark", async () => {
    const d = await draft();
    invoiceIds.push(d.id);
    await expect(docs.ensureDocument("INVOICE", d.id)).rejects.toThrow(/draft/i);
    const pdf = await docs.renderDraftPreview(actor, d.id);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await prisma.document.count({ where: { invoiceId: d.id } })).toBe(0);
  }, 60_000);

  it("stores an issued invoice once and serves the same bytes back", async () => {
    const d = await draft();
    invoiceIds.push(d.id);
    const issued = await inv.issueInvoice(actor, d.id);
    const a = await docs.ensureDocument("INVOICE", d.id);
    const b = await docs.ensureDocument("INVOICE", d.id);
    expect(b.id).toBe(a.id);
    expect(a.version).toBe(1);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.filename).toBe(`${issued.number!.replace(/\//g, "-")}.pdf`);
    expect(await storage.exists(a.storageKey)).toBe(true);
    const { stream, document } = await docs.getDocumentStream(actor, a.id);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c as Uint8Array));
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBe(document.byteSize);
    const { sha256Hex } = await import("@/lib/crypto");
    expect(sha256Hex(bytes)).toBe(a.sha256);
    const v2 = await docs.regenerateDocument(actor, "INVOICE", d.id);
    expect(v2.version).toBe(2);
    expect(v2.filename).toMatch(/-v2\.pdf$/);
    expect(await prisma.document.count({ where: { invoiceId: d.id } })).toBe(2);
  }, 90_000);
});
