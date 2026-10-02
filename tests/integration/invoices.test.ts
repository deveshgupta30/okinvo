import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { PaymentMethodInputSchema } from "@/lib/schemas/payment-method-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { InvoiceDraftInputSchema, type InvoiceDraftInput } from "@/lib/schemas/invoice-input";
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
};
const tag = `inv-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("invoice DAL", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let inv: typeof import("@/server/dal/invoices");
  let profileId: string;
  let clientId: string;
  let methodId: string;
  const ids = { invoices: [] as string[], profiles: [] as string[] };

  const draftInput = (over: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput =>
    InvoiceDraftInputSchema.parse({
      issuerProfileId: profileId,
      clientId,
      issueDate: "2026-04-15",
      dueDate: "2027-03-31",
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
      ...over,
    });

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    inv = await import("@/server/dal/invoices");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const methods = await import("@/server/dal/payment-methods");
    const existingDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      actor,
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
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (existingDefault && p.isDefault) {
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    }
    profileId = p.id;
    ids.profiles.push(p.id);
    const c = await clients.createClient(
      actor,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
        email: "client@example.com",
        billingAddress: address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        taxIdType: "GSTIN",
        taxId: "29AAAAA0000A1Z5",
        currency: "INR",
        paymentTermsDays: 15,
      }),
    );
    clientId = c.id;
    const m = await methods.createPaymentMethod(
      actor,
      PaymentMethodInputSchema.parse({
        name: `${tag} bank`,
        type: "BANK_TRANSFER",
        details: { type: "BANK_TRANSFER", accountHolder: "Me", accountNumber: "000111222333" },
        isDefault: false,
        isActive: true,
      }),
    );
    methodId = m.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { poReference: tag } } });
    await prisma.document.deleteMany({ where: { invoice: { poReference: tag } } });
    await prisma.invoice.deleteMany({ where: { replacesInvoice: { poReference: tag } } });
    await prisma.invoice.deleteMany({ where: { poReference: tag } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: { in: ids.profiles } } });
    await prisma.paymentMethodProfile.deleteMany({ where: { id: methodId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: { in: ids.profiles } } });
  });

  it("creates a draft with computed totals, no number and a verification token", async () => {
    const d = await inv.createDraft(actor, draftInput());
    ids.invoices.push(d.id);
    expect(d.status).toBe("DRAFT");
    expect(d.number).toBeNull();
    expect(d.subtotal).toBe("10000.00");
    expect(d.taxAmount).toBe("1800.00");
    expect(d.total).toBe("11800.00");
    expect(d.tdsExpected).toBe("1000.00");
    expect(d.balanceDue).toBe("11800.00");
    expect(d.supplyType).toBe("INTRA_STATE");
    expect(d.taxLines.map((t) => `${t.taxType} ${t.rate} ${t.taxAmount}`)).toEqual([
      "CGST 9 900.00",
      "SGST 9 900.00",
    ]);
    expect(d.verificationToken).toHaveLength(43);
    expect(d.displayStatus).toBe("DRAFT");
  });

  it("updates a draft (items replaced, totals recomputed) and refuses once issued", async () => {
    const d = await inv.createDraft(actor, draftInput());
    ids.invoices.push(d.id);
    const u = await inv.updateDraft(
      actor,
      d.id,
      draftInput({
        items: [
          {
            description: "A",
            sacHsnCode: "998314",
            unitType: "DAY",
            quantity: "2",
            unitPrice: "5000",
            taxRate: "18",
          },
          {
            description: "B",
            sacHsnCode: "998314",
            unitType: "FIXED",
            quantity: "1",
            unitPrice: "333.33",
            taxRate: "18",
          },
        ],
        discount: { type: "PERCENT", value: "10" },
      }),
    );
    expect(u.items.map((i) => i.description)).toEqual(["A", "B"]);
    expect(u.subtotal).toBe("10333.33");
    expect(u.discountAmount).toBe("1033.33");
    expect(u.taxableAmount).toBe("9300.00");
    expect(u.taxAmount).toBe("1674.00");
    await inv.issueInvoice(actor, d.id);
    await expect(inv.updateDraft(actor, d.id, draftInput())).rejects.toThrow(/issued/i);
    await expect(inv.deleteDraft(actor, d.id)).rejects.toThrow(/issued/i);
  });

  it("issues with a gap-free number, snapshots, rotated token and an audit row", async () => {
    const before = await prisma.documentSequence.findUnique({
      where: {
        issuerProfileId_kind_fiscalYear: {
          issuerProfileId: profileId,
          kind: "INVOICE",
          fiscalYear: "2026-27",
        },
      },
    });
    const next = before?.nextNumber ?? 1;
    const d = await inv.createDraft(actor, draftInput());
    ids.invoices.push(d.id);
    const issued = await inv.issueInvoice(actor, d.id);
    expect(issued.status).toBe("ISSUED");
    expect(issued.fiscalYear).toBe("2026-27");
    expect(issued.sequenceNumber).toBe(next);
    expect(issued.number).toBe(`INV/26-27/${String(next).padStart(3, "0")}`);
    expect(issued.verificationToken).not.toBe(d.verificationToken);
    expect(issued.issuerSnapshot?.legalName).toBe(`${tag} Legal Name`);
    expect(issued.issuerSnapshot?.gstin).toBe("29ABCDE1234F1Z5");
    expect(issued.issuerSnapshot?.pan).toBeUndefined(); // showPan is false by default
    expect(issued.clientSnapshot?.displayName).toBe(`${tag} client`);
    expect(issued.paymentMethodsSnapshot?.[0]?.lines.some((l) => l.value === "000111222333")).toBe(
      true,
    );
    // the snapshot is whatever template is in force for the profile (the shared dev DB may hold
    // a saved instance template from an e2e run), never a hard-coded default
    const { resolveTemplateConfig } = await import("@/server/dal/templates");
    expect(issued.templateSnapshot?.templateId).toBe(
      (await resolveTemplateConfig(prisma, profileId)).templateId,
    );
    expect(issued.placeOfSupply).toBe("Karnataka (29)");
    expect(issued.displayStatus).toBe("ISSUED");
    const events = await prisma.auditEvent.findMany({ where: { entityId: d.id } });
    expect(events.map((e) => e.action)).toContain("invoice.issued");
  });

  it("leaves no gap when an issue fails validation", async () => {
    const seq = async () =>
      (
        await prisma.documentSequence.findUniqueOrThrow({
          where: {
            issuerProfileId_kind_fiscalYear: {
              issuerProfileId: profileId,
              kind: "INVOICE",
              fiscalYear: "2026-27",
            },
          },
        })
      ).nextNumber;
    const before = await seq();
    const bad = await inv.createDraft(
      actor,
      draftInput({
        items: [
          {
            description: "No SAC",
            unitType: "HOUR",
            quantity: "1",
            unitPrice: "100",
            taxRate: "18",
          },
        ],
      }),
    );
    ids.invoices.push(bad.id);
    await expect(inv.issueInvoice(actor, bad.id)).rejects.toThrow(/SAC/i);
    expect(await seq()).toBe(before);
    expect((await inv.getInvoice(actor, bad.id)).status).toBe("DRAFT");
    const good = await inv.createDraft(actor, draftInput());
    ids.invoices.push(good.id);
    expect((await inv.issueInvoice(actor, good.id)).sequenceNumber).toBe(before);
  });

  it("voids only without payments, and void & reissue links both ways", async () => {
    const a = await inv.createDraft(actor, draftInput());
    ids.invoices.push(a.id);
    await inv.issueInvoice(actor, a.id);
    const pay = await prisma.payment.create({
      data: {
        invoiceId: a.id,
        paymentDate: new Date("2026-04-20T00:00:00Z"),
        amountApplied: "100.00",
      },
    });
    await expect(inv.voidInvoice(actor, a.id, "Mistake")).rejects.toThrow(/payment/i);
    await prisma.payment.delete({ where: { id: pay.id } });
    const voided = await inv.voidInvoice(actor, a.id, "Mistake");
    expect(voided.status).toBe("VOID");
    expect(voided.voidReason).toBe("Mistake");
    expect(voided.displayStatus).toBe("VOID");

    const b = await inv.createDraft(actor, draftInput());
    ids.invoices.push(b.id);
    const issuedB = await inv.issueInvoice(actor, b.id);
    const newId = await inv.voidAndReissue(actor, b.id, "Wrong rate");
    ids.invoices.push(newId);
    const fresh = await inv.getInvoice(actor, newId);
    expect(fresh.status).toBe("DRAFT");
    expect(fresh.replacesInvoiceId).toBe(b.id);
    expect(fresh.replaces?.number).toBe(issuedB.number);
    expect(fresh.items).toHaveLength(1);
    const old = await inv.getInvoice(actor, b.id);
    expect(old.status).toBe("VOID");
    expect(old.replacedById).toBe(newId);
  });

  it("marks sent once and deletes drafts only", async () => {
    const d = await inv.createDraft(actor, draftInput());
    ids.invoices.push(d.id);
    await expect(inv.markSent(actor, d.id)).rejects.toThrow(/issued/i);
    await inv.issueInvoice(actor, d.id);
    const first = await inv.markSent(actor, d.id);
    expect(first.sentAt).not.toBeNull();
    expect(first.displayStatus).toBe("SENT");
    const second = await inv.markSent(actor, d.id);
    expect(second.sentAt).toBe(first.sentAt);
    const scratch = await inv.createDraft(actor, draftInput());
    await inv.deleteDraft(actor, scratch.id);
    await expect(inv.getInvoice(actor, scratch.id)).rejects.toThrow(/not found/i);
  });

  it("lists with filters and derived status", async () => {
    const rows = await inv.listInvoices(actor, { clientId, status: "VOID" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.displayStatus === "VOID")).toBe(true);
    const drafts = await inv.listInvoices(actor, { issuerProfileId: profileId, status: "DRAFT" });
    expect(drafts.every((r) => r.status === "DRAFT")).toBe(true);
  });

  it("allocates 1..20 under 20 concurrent issues for a fresh profile", async () => {
    const profiles = await import("@/server/dal/profiles");
    const p = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "COMPANY",
        label: `${tag} concurrent`,
        legalName: `${tag} Concurrent Ltd`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        gstin: "29ABCDE1234F1Z5",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "INV/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: [],
        emailBcc: [],
      }),
    );
    ids.profiles.push(p.id);
    await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    const drafts = await Promise.all(
      Array.from({ length: 20 }, () =>
        inv.createDraft(actor, draftInput({ issuerProfileId: p.id })),
      ),
    );
    ids.invoices.push(...drafts.map((d) => d.id));
    const issued = await Promise.all(drafts.map((d) => inv.issueInvoice(actor, d.id)));
    const numbers = issued.map((i) => i.sequenceNumber).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(issued.map((i) => i.number)).size).toBe(20);
  }, 60_000);
});
