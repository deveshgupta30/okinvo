import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
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
const tag = `pay-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("payments DAL", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let payments: typeof import("@/server/dal/payments");
  let inv: typeof import("@/server/dal/invoices");
  let profileId: string;
  let clientId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    payments = await import("@/server/dal/payments");
    inv = await import("@/server/dal/invoices");
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
        invoiceNumberFormat: "PAY/{FY}/{SEQ:3}",
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
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  const issued = async () => {
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
    invoiceIds.push(d.id);
    return inv.issueInvoice(actor, d.id); // total 11800.00
  };
  const input = (over: Record<string, unknown>) =>
    PaymentInputSchema.parse({
      kind: "PAYMENT",
      paymentDate: "2026-05-10",
      amountApplied: "0",
      tdsDeducted: "0",
      bankFees: "0",
      ...over,
    });

  it("refuses payments on drafts and over-application, and derives partial/paid statuses", async () => {
    const draft = await inv.createDraft(
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
            unitPrice: "100",
            taxRate: "18",
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceIds.push(draft.id);
    await expect(
      payments.recordPayment(actor, draft.id, input({ amountApplied: "10" })),
    ).rejects.toThrow(/issued/i);

    const i = await issued();
    await expect(
      payments.recordPayment(actor, i.id, input({ amountApplied: "11800.01" })),
    ).rejects.toThrow(/exceeds/i);
    const p1 = await payments.recordPayment(
      actor,
      i.id,
      input({ amountApplied: "5000", tdsDeducted: "500", reference: "UTR1" }),
    );
    expect(p1.amountApplied).toBe("5000.00");
    let after = await inv.getInvoice(actor, i.id);
    expect(after.amountPaid).toBe("5000.00");
    expect(after.balanceDue).toBe("6800.00");
    expect(after.displayStatus).toBe("PARTIALLY_PAID");
    const ledger = await payments.listPayments(actor, i.id);
    expect(ledger.rows[0]?.runningBalance).toBe("6800.00");
    expect(ledger.totals.tdsDeducted).toBe("500.00");

    await payments.recordPayment(
      actor,
      i.id,
      input({
        amountApplied: "6800",
        receivedAmount: "80.00",
        receivedCurrency: "USD",
        exchangeRate: "85.00000000",
        bankFees: "250",
      }),
    );
    after = await inv.getInvoice(actor, i.id);
    expect(after.balanceDue).toBe("0.00");
    expect(after.displayStatus).toBe("PAID");
    const audits = await prisma.auditEvent.findMany({
      where: { entityType: "Payment", action: "payment.created" },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    expect(audits).toHaveLength(2);
  });

  it("caps write-offs at the outstanding balance, allows refunds, and restores balances on delete", async () => {
    const i = await issued();
    await payments.recordPayment(actor, i.id, input({ amountApplied: "11000" }));
    await expect(
      payments.recordPayment(actor, i.id, input({ kind: "WRITE_OFF", amountApplied: "900" })),
    ).rejects.toThrow(/exceeds/i);
    const wo = await payments.recordPayment(
      actor,
      i.id,
      input({ kind: "WRITE_OFF", amountApplied: "800" }),
    );
    expect((await inv.getInvoice(actor, i.id)).displayStatus).toBe("PAID");
    await payments.deletePayment(actor, wo.id);
    expect((await inv.getInvoice(actor, i.id)).balanceDue).toBe("800.00");
    const refund = await payments.recordPayment(
      actor,
      i.id,
      input({ kind: "REFUND", amountApplied: "-1000" }),
    );
    expect(refund.amountApplied).toBe("-1000.00");
    expect((await inv.getInvoice(actor, i.id)).balanceDue).toBe("1800.00");
    await expect(
      payments.recordPayment(actor, i.id, input({ kind: "REFUND", amountApplied: "-20000" })),
    ).rejects.toThrow(/refund/i);
    const edited = await payments.updatePayment(
      actor,
      refund.id,
      input({ kind: "REFUND", amountApplied: "-500", notes: "partial" }),
    );
    expect(edited.notes).toBe("partial");
    expect((await inv.getInvoice(actor, i.id)).balanceDue).toBe("1300.00");
  });

  it("validates the input shape: TDS within the applied amount, FX fields together", async () => {
    expect(
      PaymentInputSchema.safeParse({
        kind: "PAYMENT",
        paymentDate: "2026-05-10",
        amountApplied: "100",
        tdsDeducted: "150",
      }).success,
    ).toBe(false);
    expect(
      PaymentInputSchema.safeParse({
        kind: "PAYMENT",
        paymentDate: "2026-05-10",
        amountApplied: "100",
        receivedAmount: "1.2",
      }).success,
    ).toBe(false);
    expect(
      PaymentInputSchema.safeParse({
        kind: "PAYMENT",
        paymentDate: "2026-05-10",
        amountApplied: "-5",
      }).success,
    ).toBe(false);
    expect(
      PaymentInputSchema.safeParse({
        kind: "REFUND",
        paymentDate: "2026-05-10",
        amountApplied: "5",
      }).success,
    ).toBe(false);
  });
});
