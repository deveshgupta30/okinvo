import "dotenv/config";
import JSZip from "jszip";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { PaymentInputSchema } from "@/lib/schemas/payment-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { prepareUpload, UploadError } from "@/lib/uploads";
import type { Actor } from "@/server/actor";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const actor: Actor = {
  userId: "no-such-user",
  email: "o@example.com",
  name: "O",
  role: "OWNER",
  timezone: "UTC",
  locale: "en-US",
};
const tag = `rcpt-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};
const limits = { imageMb: 2, receiptMb: 10 };
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const png = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 9, g: 8, b: 7 } } })
    .png()
    .toBuffer();

/**
 * Addendum §4 (sub-project O): a payment carries several receipts (PDF or images, kind RECEIPT),
 * listed with the ledger, included in the documents bundle under receipts/ and in data.json.
 */
describe.skipIf(!url)("payment attachments", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let storage: typeof import("@/lib/storage").storage;
  let payments: typeof import("@/server/dal/payments");
  let profileId: string;
  let clientId: string;
  let invoiceId: string;
  let invoiceNumber: string;
  let pdfId: string;
  let pngId: string;
  let logoId: string;
  const assetIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    payments = await import("@/server/dal/payments");
    const inv = await import("@/server/dal/invoices");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const assets = await import("@/server/dal/assets");
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
        invoiceNumberFormat: "RCPT/{FY}/{SEQ:3}",
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
    const d = await inv.createDraft(
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
            quantity: "10",
            unitPrice: "1000",
            taxRate: "18",
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceId = d.id;
    const issued = await inv.issueInvoice(actor, d.id); // total 11800.00
    invoiceNumber = issued.number ?? "";
    const pdf = await assets.createAsset(
      actor,
      "RECEIPT",
      await prepareUpload(PDF, "RECEIPT", limits),
    );
    const img = await assets.createAsset(
      actor,
      "RECEIPT",
      await prepareUpload(await png(), "RECEIPT", limits),
    );
    const logo = await assets.createAsset(
      actor,
      "LOGO",
      await prepareUpload(await png(), "LOGO", limits),
    );
    pdfId = pdf.id;
    pngId = img.id;
    logoId = logo.id;
    assetIds.push(pdfId, pngId, logoId);
  });

  afterAll(async () => {
    await prisma.paymentAttachment.deleteMany({ where: { payment: { invoiceId } } });
    await prisma.payment.deleteMany({ where: { invoiceId } });
    const docs = await prisma.document.findMany({ where: { invoiceId } });
    for (const r of docs) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId } });
    await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
    const rows = await prisma.asset.findMany({ where: { id: { in: assetIds } } });
    for (const r of rows) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  });

  const input = (over: Record<string, unknown>) =>
    PaymentInputSchema.parse({
      kind: "PAYMENT",
      paymentDate: "2026-05-10",
      amountApplied: "0",
      tdsDeducted: "0",
      bankFees: "0",
      ...over,
    });

  it("rejects a text file as a receipt before anything is stored", async () => {
    await expect(prepareUpload(Buffer.from("just notes"), "RECEIPT", limits)).rejects.toMatchObject(
      { name: "UploadError", code: "UNSUPPORTED_TYPE" } satisfies Partial<UploadError>,
    );
  });

  it("accepts PDF and PNG receipts, lists them with the ledger, and refuses other asset kinds", async () => {
    const paid = await payments.recordPayment(
      actor,
      invoiceId,
      input({ amountApplied: "11800", attachmentAssetIds: [pdfId, pngId] }),
    );
    expect(paid.attachments.map((a) => [a.assetId, a.contentType])).toEqual([
      [pdfId, "application/pdf"],
      [pngId, "image/jpeg"], // receipt images are normalised to JPEG at upload (v2 §11.2)
    ]);

    const ledger = await payments.listPayments(actor, invoiceId);
    expect(ledger.rows[0]?.attachments.map((a) => a.assetId)).toEqual([pdfId, pngId]);
    expect(ledger.invoice.balanceDue).toBe("0.00");

    await expect(
      payments.updatePayment(
        actor,
        paid.id,
        input({ amountApplied: "11800", attachmentAssetIds: [logoId] }),
      ),
    ).rejects.toThrow(/receipt/i);

    const edited = await payments.updatePayment(
      actor,
      paid.id,
      input({ amountApplied: "11800", attachmentAssetIds: [pngId] }),
    );
    expect(edited.attachments.map((a) => a.assetId)).toEqual([pngId]);
    expect(await prisma.paymentAttachment.count({ where: { paymentId: paid.id } })).toBe(1);
    const audited = await prisma.auditEvent.findFirst({
      where: { entityType: "Payment", entityId: paid.id, action: "payment.updated" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(audited?.after)).toContain(pngId);
  });

  it("bundles the receipts under receipts/ and lists the links in data.json", async () => {
    const { documentsBundleEntries } = await import("@/server/exports/documents-bundle");
    const { snapshotJsonChunks } = await import("@/server/exports/all-data");
    const { zipBuffer } = await import("@/lib/exports/zip");
    const rows = await prisma.payment.findMany({ where: { invoiceId } });
    const paymentId = rows[0]?.id ?? "";
    await payments.updatePayment(
      actor,
      paymentId,
      input({ amountApplied: "11800", attachmentAssetIds: [pdfId, pngId] }),
    );

    const zip = await JSZip.loadAsync(
      await zipBuffer(documentsBundleEntries(actor, { fy: "2026-27", issuerProfileId: profileId })),
    );
    const stem = invoiceNumber.replace(/\//g, "-");
    expect(Object.keys(zip.files).sort()).toEqual([
      "index.csv",
      `invoices/${stem}.pdf`,
      `receipts/${stem}/2026-05-10-1.pdf`,
      `receipts/${stem}/2026-05-10-2.jpg`,
    ]);
    const receipt = await zip.file(`receipts/${stem}/2026-05-10-1.pdf`)?.async("nodebuffer");
    expect(receipt?.subarray(0, 5).toString()).toBe("%PDF-");

    let json = "";
    for await (const chunk of snapshotJsonChunks(new Date().toISOString())) json += chunk;
    const data = JSON.parse(json) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    const links = data.tables.paymentAttachments?.filter((r) => r.paymentId === paymentId) ?? [];
    expect(links.map((r) => r.assetId).sort()).toEqual([pdfId, pngId].sort()); // rows are by id
    expect(Object.keys(data.tables).indexOf("paymentAttachments")).toBe(
      Object.keys(data.tables).indexOf("payments") + 1,
    );
  }, 60_000); // renders the invoice PDF and walks every table
});
