import "dotenv/config";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import type { Actor } from "@/server/actor";

/**
 * DOCX copies (spec §9d): `ensureDocument(kind, id, { format: "DOCX" })` stores a DOCX version
 * beside the PDF, idempotently, with its own hash and filename; the download stream carries the
 * OOXML bytes; the PDF row is untouched.
 */
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
const tag = `docx-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

async function bytesOf(stream: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks);
}

describe.skipIf(!url)("DOCX documents", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let docs: typeof import("@/server/dal/documents");
  let inv: typeof import("@/server/dal/invoices");
  let storage: typeof import("@/lib/storage").storage;
  let profileId: string;
  let clientId: string;
  let invoiceId: string;

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
        type: "INDIVIDUAL",
        label: `${tag} issuer`,
        legalName: `${tag} Person`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "DCX/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "DCC/{FY}/{SEQ:3}",
        defaultTaxRegime: "NONE",
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
        currency: "INR",
        paymentTermsDays: 15,
      }),
    );
    clientId = c.id;
    const d = await inv.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-05-01",
        dueDate: "2026-05-31",
        currency: "INR",
        taxRegime: "NONE",
        items: [
          {
            description: "Docx work",
            unitType: "HOUR",
            quantity: "2",
            unitPrice: "1500",
            taxRate: "0",
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceId = d.id;
    await inv.issueInvoice(actor, d.id);
  });

  afterAll(async () => {
    const rows = await prisma.document.findMany({ where: { invoiceId } });
    for (const r of rows) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId } });
    await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  it("stores one DOCX version beside the PDF and streams OOXML", async () => {
    const pdf = await docs.ensureDocument("INVOICE", invoiceId);
    const a = await docs.ensureDocument("INVOICE", invoiceId, { format: "DOCX" });
    const b = await docs.ensureDocument("INVOICE", invoiceId, { format: "DOCX" });
    expect(a.format).toBe("DOCX");
    expect(a.version).toBe(1);
    expect(b.id).toBe(a.id);
    expect(a.id).not.toBe(pdf.id);
    expect(a.filename).toMatch(/\.docx$/);
    expect(a.storageKey).toMatch(/-v1\.docx$/);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.sha256).not.toBe(pdf.sha256);
    const { document, stream } = await docs.getDocumentStream(actor, a.id);
    const bytes = await bytesOf(stream);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.length).toBe(document.byteSize);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Docx work");
    expect(xml).toContain("3,000.00");
    // the canonical PDF row is unchanged
    const again = await docs.ensureDocument("INVOICE", invoiceId);
    expect(again.id).toBe(pdf.id);
    // the Factur-X copy (spec §9e) is its own PDF_A3 version with the XML embedded
    const fx = await docs.ensureDocument("INVOICE", invoiceId, { format: "PDF_A3" });
    expect(fx.format).toBe("PDF_A3");
    expect(fx.filename).toMatch(/-facturx\.pdf$/);
    expect(fx.storageKey).toMatch(/-v1-facturx\.pdf$/);
    expect((await docs.ensureDocument("INVOICE", invoiceId, { format: "PDF_A3" })).id).toBe(fx.id);
    const fxBytes = await bytesOf((await docs.getDocumentStream(actor, fx.id)).stream);
    expect(fxBytes.subarray(0, 8).toString()).toBe("%PDF-1.7");
    const raw = fxBytes.toString("latin1");
    expect(raw).toContain("factur-x.xml");
    expect(raw).toContain("/GTS_PDFA1");
    expect(raw).toContain("/AFRelationship /Alternative");
    expect(again.sha256).toBe(pdf.sha256);
    expect(await prisma.document.count({ where: { invoiceId } })).toBe(3);
  }, 120_000);

  it("refuses a DOCX for a draft", async () => {
    const d = await inv.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-05-02",
        dueDate: "2026-05-31",
        currency: "INR",
        taxRegime: "NONE",
        items: [
          { description: "Draft", unitType: "HOUR", quantity: "1", unitPrice: "1", taxRate: "0" },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    try {
      await expect(docs.ensureDocument("INVOICE", d.id, { format: "DOCX" })).rejects.toThrow(
        /draft/i,
      );
    } finally {
      await prisma.invoice.delete({ where: { id: d.id } });
    }
  }, 60_000);
});
