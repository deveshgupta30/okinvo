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

// "Today" is fixed by the actor's zone; the fixture dates are chosen relative to 2026-10-01 (the
// session date) but the assertions only rely on dueDate < today for the overdue invoice.
const actor: Actor = {
  userId: "no-such-user",
  email: "o@example.com",
  name: "O",
  role: "OWNER",
  timezone: "UTC",
  locale: "en-US",
};
const tag = `dash-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("dashboard", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let dash: typeof import("@/server/dal/dashboard");
  let inv: typeof import("@/server/dal/invoices");
  let payments: typeof import("@/server/dal/payments");
  let profileId: string;
  let inrClient: string;
  let usdClient: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    dash = await import("@/server/dal/dashboard");
    inv = await import("@/server/dal/invoices");
    payments = await import("@/server/dal/payments");
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
        invoiceNumberFormat: "DSH/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault)
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    profileId = p.id;
    inrClient = (
      await clients.createClient(
        actor,
        ClientInputSchema.parse({
          displayName: `${tag} INR client`,
          billingAddress: address,
          countryCode: "IN",
          stateCode: "KA",
          gstStateCode: "29",
          currency: "INR",
          paymentTermsDays: 15,
        }),
      )
    ).id;
    usdClient = (
      await clients.createClient(
        actor,
        ClientInputSchema.parse({
          displayName: `${tag} USD client`,
          billingAddress: { line1: "1 Main St", city: "Austin", countryCode: "US" },
          countryCode: "US",
          currency: "USD",
          paymentTermsDays: 30,
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: { in: [inrClient, usdClient] } } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  it("summarises outstanding, overdue, billed/received this FY in base currency, drafts, recent and top clients", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fyStart =
      Number(today.slice(5, 7)) >= 4
        ? `${today.slice(0, 4)}-04-01`
        : `${Number(today.slice(0, 4)) - 1}-04-01`;
    const mk = (clientId: string, currency: string, dueDate: string, fx = "1", price = "1000") =>
      inv.createDraft(
        actor,
        InvoiceDraftInputSchema.parse({
          issuerProfileId: profileId,
          clientId,
          issueDate: fyStart,
          dueDate,
          currency,
          taxRegime: "NONE",
          fxRateToBase: fx,
          items: [
            {
              description: "Work",
              unitType: "HOUR",
              quantity: "1",
              unitPrice: price,
              taxRate: "0",
            },
          ],
          displayConfig: DEFAULT_DISPLAY_CONFIG,
        }),
      );
    const a = await mk(inrClient, "INR", "2026-04-30"); // overdue once issued (due in the past)
    const b = await mk(usdClient, "USD", "2099-01-01", "85.00000000", "100"); // 100 USD = 8500 INR
    const c = await mk(inrClient, "INR", "2099-01-01");
    invoiceIds.push(a.id, b.id, c.id);
    await inv.issueInvoice(actor, a.id);
    const issuedB = await inv.issueInvoice(actor, b.id);
    await payments.recordPayment(
      actor,
      issuedB.id,
      PaymentInputSchema.parse({ kind: "PAYMENT", paymentDate: today, amountApplied: "100" }),
    );

    const d = await dash.dashboardData(actor, { issuerProfileId: profileId });
    expect(d.baseCurrency).toBe("INR");
    expect(d.outstanding).toEqual([{ currency: "INR", count: 1, amount: "1000.00" }]);
    expect(d.overdue).toEqual([{ currency: "INR", count: 1, amount: "1000.00" }]);
    expect(d.billedThisFy).toBe("9500.00"); // 1000 INR + 100 USD × 85
    expect(d.receivedThisFy).toBe("8500.00");
    expect(d.draftsCount).toBe(1);
    expect(d.recent.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
    expect(d.topClients[0]).toMatchObject({
      clientId: inrClient,
      currency: "INR",
      outstanding: "1000.00",
    });
  });
});
