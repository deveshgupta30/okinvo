import "dotenv/config";
import { PDFParse } from "pdf-parse";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { PaymentMethodInputSchema } from "@/lib/schemas/payment-method-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";
import { FIXTURE_IRN, fixtureIrpResponse } from "../unit/signed-qr.test";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const owner: Actor = {
  userId: "no-such-user",
  email: "o@example.com",
  name: "O",
  role: "OWNER",
  timezone: "UTC",
  locale: "en-US",
};
const viewer: Actor = { ...owner, role: "VIEWER" };
const tag = `irn-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

async function pdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

/**
 * IRN registration (spec §9e): the manual connector records the portal's response, the
 * invoice carries the state, the stored PDF is regenerated with the IRN; cancellation is
 * refused after 24 hours and works inside the window; viewers are refused.
 */
describe.skipIf(!url)("e-invoice registration", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let einv: typeof import("@/server/dal/einvoice");
  let inv: typeof import("@/server/dal/invoices");
  let docs: typeof import("@/server/dal/documents");
  let profileId: string;
  let clientId: string;
  let methodId: string;
  let invoiceId: string;
  let previousSetting: unknown = null;

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    einv = await import("@/server/dal/einvoice");
    inv = await import("@/server/dal/invoices");
    docs = await import("@/server/dal/documents");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const methods = await import("@/server/dal/payment-methods");
    const settings = await import("@/server/dal/einvoice-settings");
    previousSetting =
      (await prisma.appSetting.findUnique({ where: { key: "einvoice" } }))?.value ?? null;
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      owner,
      ProfileInputSchema.parse({
        type: "INDIVIDUAL",
        label: `${tag} issuer`,
        legalName: `${tag} Legal Name`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        panNumber: "ABCDE1234F",
        gstin: "29ABCDE1234F1Z5",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "INV/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        einvoiceEnabled: "on",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault && p.isDefault) {
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    }
    profileId = p.id;
    await settings.saveEInvoiceProfileSettings(owner, { profileId, indiaConnector: "manual" });
    const c = await clients.createClient(
      owner,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
        email: "client@example.com",
        billingAddress: { ...address, line1: "2 Client Road", postalCode: "560002" },
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        taxIdType: "GSTIN",
        taxId: "29AAAAA0000A1Z5",
        currency: "INR",
        paymentTermsDays: "15",
      }),
    );
    clientId = c.id;
    const m = await methods.createPaymentMethod(
      owner,
      PaymentMethodInputSchema.parse({
        name: `${tag} bank`,
        type: "BANK_TRANSFER",
        details: {
          type: "BANK_TRANSFER",
          accountHolder: "Test",
          accountNumber: "000111222333",
          ifsc: "HDFC0001234",
        },
        isDefault: false,
        isActive: true,
      }),
    );
    methodId = m.id;
    invoiceId = await issueOne();
  });

  /** A fresh issued invoice of the fixture profile (the afterAll sweeps everything tagged). */
  async function issueOne(): Promise<string> {
    const d = await inv.createDraft(
      owner,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-04-15",
        dueDate: "2026-04-30",
        currency: "INR",
        taxRegime: "INDIA_GST",
        isReverseCharge: false,
        fxRateToBase: "1",
        items: [
          {
            description: "Design work",
            sacHsnCode: "998314",
            unitType: "HOUR",
            quantity: "10",
            unitPrice: "1000",
            taxRate: "18",
          },
        ],
        discount: null,
        roundingAdjustment: null,
        tdsRate: "10",
        paymentMethodIds: [methodId],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
        poReference: tag,
      }),
    );
    return (await inv.issueInvoice(owner, d.id)).id;
  }

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { invoice: { poReference: tag } } });
    await prisma.invoice.deleteMany({ where: { poReference: tag } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.paymentMethodProfile.deleteMany({ where: { id: methodId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
    if (previousSetting === null)
      await prisma.appSetting.deleteMany({ where: { key: "einvoice" } });
    else
      await prisma.appSetting.update({
        where: { key: "einvoice" },
        data: { value: previousSetting as object },
      });
  });

  it("refuses the NIC path on a manual connector and viewers altogether", async () => {
    await expect(einv.generateIrn(owner, invoiceId)).rejects.toThrow(/paste/i);
    await expect(einv.recordManualIrn(viewer, invoiceId, fixtureIrpResponse())).rejects.toThrow();
    expect((await einv.einvoiceStatus(owner, invoiceId)).status).toBe("NONE");
  });

  it("registers an IRN recorded before the background first render stored its row: v1 stays, the IRN PDF is v2", async () => {
    const id = await issueOne();
    // The issue action renders v1 after its response (actions/invoices.ts scheduleRender). A
    // registration inside that window finds the v1 blob in storage but no Document row yet.
    const first = await docs.ensureDocument("INVOICE", id);
    await prisma.document.delete({ where: { id: first.id } });
    const state = await einv.recordManualIrn(owner, id, fixtureIrpResponse());
    expect(state.status).toBe("REGISTERED");
    const dto = await inv.getInvoice(owner, id);
    expect(dto.documents.map((d) => d.version)).toEqual([1, 2]);
    expect(dto.documents[0]!.sha256).toBe(first.sha256);
    expect(dto.documents[1]!.sha256).not.toBe(first.sha256);
  });

  it("records the portal's response, carries the state and regenerates the PDF with the IRN", async () => {
    const first = await docs.ensureDocument("INVOICE", invoiceId);
    expect(first.version).toBe(1);
    const state = await einv.recordManualIrn(owner, invoiceId, fixtureIrpResponse());
    expect(state.status).toBe("REGISTERED");
    expect(state.irn).toBe(FIXTURE_IRN);
    expect(state.ackNo).toBe("112010000000001");
    expect(state.connector).toBe("manual");
    const dto = await inv.getInvoice(owner, invoiceId);
    expect(dto.einvoice?.irn).toBe(FIXTURE_IRN);
    expect(dto.einvoiceStatus).toBe("REGISTERED");
    const latest = dto.documents[dto.documents.length - 1]!;
    expect(latest.version).toBe(2);
    const { stream } = await docs.getDocumentStream(owner, latest.id);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c as Uint8Array));
    const text = await pdfText(Buffer.concat(chunks));
    expect(text).toContain("IRN");
    expect(text.replace(/\s+/g, "")).toContain(FIXTURE_IRN);
    expect(text).toContain("112010000000001");
    const events = await prisma.auditEvent.findMany({
      where: { entityId: invoiceId, action: "einvoice.registered" },
    });
    expect(events).toHaveLength(1);
    await expect(einv.recordManualIrn(owner, invoiceId, fixtureIrpResponse())).rejects.toThrow(
      /already/,
    );
  });

  it("lists the invoice under the e-invoice register filter", async () => {
    const registered = await inv.listInvoices(owner, { page: 1, einvoice: "registered", q: tag });
    expect(registered.map((r) => r.id)).toContain(invoiceId);
    const none = await inv.listInvoices(owner, { page: 1, einvoice: "none", q: tag });
    expect(none.map((r) => r.id)).not.toContain(invoiceId);
  });

  it("refuses a cancellation after 24 hours and records one inside the window", async () => {
    const ack = Date.parse("2026-04-15T05:00:00.000Z");
    await expect(
      einv.cancelIrn(owner, invoiceId, "2", "late", new Date(ack + 25 * 60 * 60 * 1000)),
    ).rejects.toThrow(/24 hours/);
    await expect(
      einv.cancelIrn(viewer, invoiceId, "2", "x", new Date(ack + 1000)),
    ).rejects.toThrow();
    const state = await einv.cancelIrn(
      owner,
      invoiceId,
      "2",
      "Wrong buyer",
      new Date(ack + 60 * 60 * 1000),
    );
    expect(state.status).toBe("CANCELLED");
    expect(state.cancelReason).toBe("Data entry mistake: Wrong buyer");
    const dto = await inv.getInvoice(owner, invoiceId);
    expect(dto.einvoiceStatus).toBe("CANCELLED");
    expect(dto.documents[dto.documents.length - 1]?.version).toBe(3);
    const cancelled = await inv.listInvoices(owner, { page: 1, einvoice: "cancelled", q: tag });
    expect(cancelled.map((r) => r.id)).toContain(invoiceId);
    await expect(einv.generateIrn(owner, invoiceId)).rejects.toThrow(/cancelled/i);
  });
});
