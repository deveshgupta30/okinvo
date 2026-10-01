import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { CreditNoteInputSchema } from "@/lib/schemas/credit-note-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { PaymentInputSchema } from "@/lib/schemas/payment-input";
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
const tag = `csum-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("client summary", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let clients: typeof import("@/server/dal/clients");
  let profileId: string;
  let clientId: string;
  let emptyClientId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    clients = await import("@/server/dal/clients");
    const profiles = await import("@/server/dal/profiles");
    const inv = await import("@/server/dal/invoices");
    const payments = await import("@/server/dal/payments");
    const cns = await import("@/server/dal/credit-notes");
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
        invoiceNumberFormat: "CSM/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "CSN/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault)
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    profileId = p.id;
    const mk = async (name: string) =>
      (
        await clients.createClient(
          actor,
          ClientInputSchema.parse({
            displayName: `${tag} ${name}`,
            billingAddress: address,
            countryCode: "IN",
            stateCode: "KA",
            gstStateCode: "29",
            currency: "INR",
            paymentTermsDays: 15,
          }),
        )
      ).id;
    clientId = await mk("client");
    emptyClientId = await mk("empty");
    const draft = async (issueDate: string, dueDate: string, qty: string) => {
      const d = await inv.createDraft(
        actor,
        InvoiceDraftInputSchema.parse({
          issuerProfileId: profileId,
          clientId,
          issueDate,
          dueDate,
          currency: "INR",
          taxRegime: "INDIA_GST",
          items: [
            {
              description: "Work",
              sacHsnCode: "998314",
              unitType: "HOUR",
              quantity: qty,
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
    // A: 11800, paid 5000, credited 1180 → 5620 outstanding, not yet due.
    const a = await inv.issueInvoice(actor, (await draft("2026-05-01", "2027-03-31", "10")).id);
    await payments.recordPayment(
      actor,
      a.id,
      PaymentInputSchema.parse({
        kind: "PAYMENT",
        paymentDate: "2026-05-20",
        amountApplied: "5000",
        tdsDeducted: "500",
      }),
    );
    const cn = await cns.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: a.id,
        reason: "Scope",
        subtotal: "1000",
        issueDate: "2026-05-25",
      }),
    );
    await cns.issueCreditNote(actor, cn.id);
    // B: 2360 issued, due in the past → overdue in full.
    await inv.issueInvoice(actor, (await draft("2026-04-01", "2026-04-15", "2")).id);
    // C: a draft — never counted.
    await draft("2026-06-01", "2026-06-30", "1");
  });

  afterAll(async () => {
    await prisma.document.deleteMany({
      where: {
        OR: [{ invoiceId: { in: invoiceIds } }, { creditNote: { invoiceId: { in: invoiceIds } } }],
      },
    });
    await prisma.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: { in: [clientId, emptyClientId] } } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  it("totals issued invoices per currency with overdue and draft counts", async () => {
    const s = await clients.clientSummary(actor, clientId);
    expect(s.drafts).toBe(1);
    expect(s.currencies).toEqual([
      {
        currency: "INR",
        invoices: 2,
        billed: "14160.00",
        received: "5000.00",
        credited: "1180.00",
        outstanding: "7980.00",
        overdue: "2360.00",
        overdueCount: 1,
      },
    ]);
    expect(s.firstInvoiceDate).toBe("2026-04-01");
    expect(s.lastInvoiceDate).toBe("2026-05-01");
  });

  it("counts money received from payments only: a write-off is not cash", async () => {
    const payments = await import("@/server/dal/payments");
    const inv = await import("@/server/dal/invoices");
    const b = (await inv.listInvoices(actor, { clientId, status: "OVERDUE" }))[0];
    if (!b) throw new Error("expected the overdue invoice B");
    await payments.recordPayment(
      actor,
      b.id,
      PaymentInputSchema.parse({
        kind: "WRITE_OFF",
        paymentDate: "2026-06-01",
        amountApplied: "360",
      }),
    );
    const s = await clients.clientSummary(actor, clientId);
    expect(s.currencies[0]).toMatchObject({
      received: "5000.00", // unchanged by the write-off
      outstanding: "7620.00", // 7980 − 360
      overdue: "2000.00",
    });
  });

  it("is empty for a client without invoices", async () => {
    const s = await clients.clientSummary(actor, emptyClientId);
    expect(s).toEqual({
      drafts: 0,
      currencies: [],
      firstInvoiceDate: null,
      lastInvoiceDate: null,
    });
  });
});
