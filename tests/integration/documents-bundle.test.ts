import "dotenv/config";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
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
const tag = `bundle-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("documents bundle", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let storage: typeof import("@/lib/storage").storage;
  let profileId: string;
  let clientId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const inv = await import("@/server/dal/invoices");
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
        invoiceNumberFormat: "EXPD/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "ECN/{FY}/{SEQ:3}",
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
    const draft = async (issueDate: string) => {
      const d = await inv.createDraft(
        actor,
        InvoiceDraftInputSchema.parse({
          issuerProfileId: profileId,
          clientId,
          issueDate,
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
      invoiceIds.push(d.id);
      return d;
    };
    await inv.issueInvoice(actor, (await draft("2026-05-01")).id);
    await draft("2026-05-02"); // stays a draft: never bundled
  });

  afterAll(async () => {
    const docs = await prisma.document.findMany({ where: { invoiceId: { in: invoiceIds } } });
    for (const r of docs) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  it("bundles issued PDFs named by number, rendering missing ones, with an index.csv", async () => {
    const { documentsBundleEntries } = await import("@/server/exports/documents-bundle");
    const { zipBuffer } = await import("@/lib/exports/zip");
    expect(await prisma.document.count({ where: { invoiceId: { in: invoiceIds } } })).toBe(0);

    const buf = await zipBuffer(
      documentsBundleEntries(actor, { fy: "2026-27", issuerProfileId: profileId }),
    );
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).sort()).toEqual(["index.csv", "invoices/EXPD-26-27-001.pdf"]);

    const pdf = await zip.file("invoices/EXPD-26-27-001.pdf")?.async("nodebuffer");
    if (!pdf) throw new Error("pdf missing");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const stored = await prisma.document.findFirstOrThrow({
      where: { invoiceId: { in: invoiceIds } },
    });
    expect(createHash("sha256").update(pdf).digest("hex")).toBe(stored.sha256);

    const index = await zip.file("index.csv")?.async("string");
    expect(index?.slice(1).split("\r\n")).toEqual([
      "Kind,Number,Status,Issue date,Issuer,Client,Currency,Total,File,Version,SHA-256",
      `INVOICE,EXPD/26-27/001,ISSUED,2026-05-01,${tag} issuer,${tag} client,INR,1180.00,invoices/EXPD-26-27-001.pdf,1,${stored.sha256}`,
      "",
    ]);
  });
});
