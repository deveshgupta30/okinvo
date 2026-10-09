import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { CreditNoteInputSchema } from "@/lib/schemas/credit-note-input";
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
  locale: "en-US",
};
const tag = `cn-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("credit notes DAL", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let cns: typeof import("@/server/dal/credit-notes");
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
    cns = await import("@/server/dal/credit-notes");
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
        invoiceNumberFormat: "CNI/{FY}/{SEQ:3}",
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
    const rows = await prisma.document.findMany({
      where: {
        OR: [{ invoiceId: { in: invoiceIds } }, { creditNote: { invoiceId: { in: invoiceIds } } }],
      },
    });
    for (const r of rows) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({
      where: {
        OR: [{ invoiceId: { in: invoiceIds } }, { creditNote: { invoiceId: { in: invoiceIds } } }],
      },
    });
    await prisma.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  const issuedInvoice = async (
    items = [
      {
        description: "Work",
        sacHsnCode: "998314",
        unitType: "HOUR",
        quantity: "10",
        unitPrice: "1000",
        taxRate: "18",
      },
    ],
  ) => {
    const d = await inv.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-05-01",
        dueDate: "2027-03-31",
        currency: "INR",
        taxRegime: "INDIA_GST",
        items,
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceIds.push(d.id);
    return inv.issueInvoice(actor, d.id);
  };

  it("drafts with apportioned tax, issues with its own number, reduces the balance, and is capped", async () => {
    const i = await issuedInvoice(); // 10000 + CGST 900 + SGST 900 = 11800
    const draft = await cns.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: i.id,
        reason: "Milestone 2 cancelled",
        subtotal: "1000",
        issueDate: "2026-05-10",
      }),
    );
    expect(draft.status).toBe("DRAFT");
    expect(draft.number).toBeNull();
    expect(
      draft.taxLines.map((t) => `${t.taxType} ${t.rate} ${t.taxableAmount} ${t.taxAmount}`),
    ).toEqual(["CGST 9 1000.00 90.00", "SGST 9 1000.00 90.00"]);
    expect(draft.total).toBe("1180.00");
    expect((await inv.getInvoice(actor, i.id)).amountCredited).toBe("0.00"); // drafts do not count

    const issued = await cns.issueCreditNote(actor, draft.id);
    expect(issued.number).toBe("CN/26-27/001");
    expect(issued.verificationToken).not.toBe(draft.verificationToken);
    expect(issued.snapshot?.invoice.number).toBe(i.number);
    expect(issued.templateSnapshot?.templateId).toBeTruthy();
    const after = await inv.getInvoice(actor, i.id);
    expect(after.amountCredited).toBe("1180.00");
    expect(after.balanceDue).toBe("10620.00");
    expect(after.creditNotes.map((c) => c.number)).toEqual(["CN/26-27/001"]);

    // Outstanding taxable balance is now 9000: a 9500 credit must be refused at issue time.
    const tooBig = await cns.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: i.id,
        reason: "Too much",
        subtotal: "9500",
        issueDate: "2026-05-11",
      }),
    );
    await expect(cns.issueCreditNote(actor, tooBig.id)).rejects.toThrow(/exceeds/i);
    await cns.deleteCreditNoteDraft(actor, tooBig.id);

    const doc = await docs.ensureDocument("CREDIT_NOTE", issued.id);
    expect(doc.filename).toBe("CN-26-27-001.pdf");
    const voided = await cns.voidCreditNote(actor, issued.id, "Issued by mistake");
    expect(voided.status).toBe("VOID");
    expect((await inv.getInvoice(actor, i.id)).balanceDue).toBe("11800.00");
    const list = await cns.listCreditNotes(actor, { clientId });
    expect(list.some((r) => r.id === issued.id && r.displayStatus === "VOID")).toBe(true);
  }, 90_000);

  it("apportions mixed-rate invoices within each tax type so the parts foot", async () => {
    const i = await issuedInvoice([
      {
        description: "A",
        sacHsnCode: "998314",
        unitType: "HOUR",
        quantity: "1",
        unitPrice: "10000",
        taxRate: "18",
      },
      {
        description: "B",
        sacHsnCode: "998314",
        unitType: "HOUR",
        quantity: "1",
        unitPrice: "5000",
        taxRate: "12",
      },
    ]);
    const cn = await cns.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: i.id,
        reason: "Goodwill",
        subtotal: "1000",
        issueDate: "2026-05-12",
      }),
    );
    const byType: Record<string, number> = {};
    for (const t of cn.taxLines)
      byType[t.taxType] = (byType[t.taxType] ?? 0) + Number(t.taxableAmount);
    expect(byType.CGST).toBeCloseTo(1000, 2);
    expect(byType.SGST).toBeCloseTo(1000, 2);
    expect(
      cn.taxLines.map((t) => `${t.taxType} ${t.rate} ${t.taxableAmount} ${t.taxAmount}`).sort(),
    ).toEqual(
      [
        "CGST 9 666.67 60.00",
        "SGST 9 666.67 60.00",
        "CGST 6 333.33 20.00",
        "SGST 6 333.33 20.00",
      ].sort(),
    );
    expect(cn.total).toBe("1160.00");
    // A zero amount is refused by the schema before it reaches the DAL.
    expect(() =>
      CreditNoteInputSchema.parse({
        invoiceId: i.id,
        reason: "Goodwill",
        subtotal: "0",
        issueDate: "2026-05-12",
      }),
    ).toThrow(/greater than zero/);
  });
});
