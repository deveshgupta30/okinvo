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
  email: "o@example.com",
  name: "O",
  role: "OWNER",
  timezone: "UTC",
};
const tag = `verify-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("verification lookup", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let verification: typeof import("@/server/dal/verification");
  let inv: typeof import("@/server/dal/invoices");
  let docs: typeof import("@/server/dal/documents");
  let storage: typeof import("@/lib/storage").storage;
  let profileId: string;
  let clientId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    verification = await import("@/server/dal/verification");
    inv = await import("@/server/dal/invoices");
    docs = await import("@/server/dal/documents");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "INDIVIDUAL",
        label: `${tag} issuer`,
        legalName: `${tag} Legal`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        gstin: "29ABCDE1234F1Z5",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "VER/{FY}/{SEQ:3}",
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

  it("never resolves drafts, garbage or unknown tokens", async () => {
    const d = await draft();
    invoiceIds.push(d.id);
    expect(await verification.lookupByToken(d.verificationToken)).toBeNull();
    expect(await verification.lookupByToken("")).toBeNull();
    expect(await verification.lookupByToken("../../etc/passwd")).toBeNull();
    expect(await verification.lookupByToken("A".repeat(43))).toBeNull();
  });

  it("resolves issued and void invoices with public fields and every stored hash, never payment status", async () => {
    const d = await draft();
    invoiceIds.push(d.id);
    const issued = await inv.issueInvoice(actor, d.id);
    expect(await verification.lookupByToken(d.verificationToken)).toBeNull(); // draft token rotated at issue
    const doc = await docs.ensureDocument("INVOICE", d.id);
    const r = await verification.lookupByToken(issued.verificationToken);
    expect(r).not.toBeNull();
    expect(r).toMatchObject({
      kind: "INVOICE",
      number: issued.number,
      issuerLegalName: `${tag} Legal`,
      gstin: "29ABCDE1234F1Z5",
      clientName: `${tag} client`,
      issueDate: "2026-05-01",
      currency: "INR",
      total: "1180.00",
      status: "valid",
    });
    expect(r?.hashes).toEqual([{ version: 1, sha256: doc.sha256, format: "PDF" }]);
    expect(JSON.stringify(r)).not.toMatch(/balance|paid|amountPaid/i);
    await inv.voidInvoice(actor, d.id, "Test void");
    expect((await verification.lookupByToken(issued.verificationToken))?.status).toBe("void");
  }, 60_000);
});
