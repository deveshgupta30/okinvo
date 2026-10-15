import "dotenv/config";
import { PDFParse } from "pdf-parse";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import type { Actor } from "@/server/actor";

/**
 * Password-protected copies (spec §5.5): a PDF_PROTECTED version that opens only with the user
 * password and allows reading and printing but not copying or editing; the canonical PDF row is
 * untouched.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

// PDF.js permission flags (pdfjs-dist PermissionFlag)
const PRINT = 4;
const MODIFY_CONTENTS = 8;
const COPY = 16;
const MODIFY_ANNOTATIONS = 32;
const FILL_INTERACTIVE_FORMS = 256;
const COPY_FOR_ACCESSIBILITY = 512;
const ASSEMBLE = 1024;
const PRINT_HIGH_QUALITY = 2048;

const actor: Actor = {
  userId: "no-such-user",
  email: "owner@example.com",
  name: "Owner",
  role: "OWNER",
  timezone: "Asia/Kolkata",
  locale: "en-US",
};
const tag = `prot-${Date.now()}`;
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

describe.skipIf(!url)("protected documents", () => {
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
        invoiceNumberFormat: "PRT/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "PRC/{FY}/{SEQ:3}",
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
            description: "Work",
            unitType: "HOUR",
            quantity: "1",
            unitPrice: "1000",
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

  it("stores a PDF_PROTECTED version that opens with the user password and allows print only", async () => {
    const canonical = await docs.ensureDocument("INVOICE", invoiceId);
    const protectedDoc = await docs.ensureProtectedDocument(actor, "INVOICE", invoiceId, {
      userPassword: "open-sesame-123",
      ownerPassword: "owner-only-secret-456",
    });
    expect(protectedDoc.format).toBe("PDF_PROTECTED");
    expect(protectedDoc.version).toBe(1);
    expect(protectedDoc.storageKey).toMatch(/-v1-protected\.pdf$/);
    expect(protectedDoc.filename).toMatch(/-protected\.pdf$/);
    expect(protectedDoc.sha256).not.toBe(canonical.sha256);

    const { stream } = await docs.getDocumentStream(actor, protectedDoc.id);
    const pdf = await bytesOf(stream);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/Encrypt");

    // without the password it does not open
    const locked = new PDFParse({ data: new Uint8Array(pdf) });
    await expect(locked.getInfo()).rejects.toThrow(/password/i);
    await locked.destroy();

    // with it, the permissions are read + print (high quality) + accessibility, nothing else
    const open = new PDFParse({ data: new Uint8Array(pdf), password: "open-sesame-123" });
    try {
      const info = await open.getInfo();
      expect(info.total).toBeGreaterThanOrEqual(1);
      const perms = info.permission ?? [];
      expect(perms).toContain(PRINT);
      expect(perms).toContain(PRINT_HIGH_QUALITY);
      expect(perms).toContain(COPY_FOR_ACCESSIBILITY);
      for (const denied of [
        COPY,
        MODIFY_CONTENTS,
        MODIFY_ANNOTATIONS,
        FILL_INTERACTIVE_FORMS,
        ASSEMBLE,
      ]) {
        expect(perms, String(denied)).not.toContain(denied);
      }
    } finally {
      await open.destroy();
    }

    // the canonical PDF row is unchanged, a second protected copy is version 2
    const again = await docs.ensureDocument("INVOICE", invoiceId);
    expect(again.id).toBe(canonical.id);
    expect(again.sha256).toBe(canonical.sha256);
    const second = await docs.ensureProtectedDocument(actor, "INVOICE", invoiceId, {
      userPassword: "another-one",
      ownerPassword: "owner-only-secret-789",
    });
    expect(second.version).toBe(2);
    const events = await prisma.auditEvent.findMany({
      where: { entityId: { in: [protectedDoc.id, second.id] }, action: "document.protected" },
    });
    expect(events).toHaveLength(2);
  }, 120_000);

  it("refuses a protected copy to a viewer", async () => {
    await expect(
      docs.ensureProtectedDocument({ ...actor, role: "VIEWER" }, "INVOICE", invoiceId, {
        userPassword: "x-y-z-1",
        ownerPassword: "o-w-n-e-r",
      }),
    ).rejects.toThrow();
  });
});
