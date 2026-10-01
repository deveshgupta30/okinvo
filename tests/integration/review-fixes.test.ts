import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { CreditNoteInputSchema } from "@/lib/schemas/credit-note-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { PaymentInputSchema } from "@/lib/schemas/payment-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

/**
 * Findings of the whole-branch review, each pinned by the test that reproduced it:
 * row locks on the issue / payment / credit-note transactions, void vs issued credit notes,
 * duplicate numbers reported as invariants, orphaned blobs adopted, dashboard base-currency
 * scoping, credit-note verification tokens.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const actor: Actor = {
  userId: "no-such-user",
  email: "o@example.com",
  name: "O",
  role: "OWNER",
  timezone: "UTC",
};
const tag = `rf-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("review fixes", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let inv: typeof import("@/server/dal/invoices");
  let payments: typeof import("@/server/dal/payments");
  let cns: typeof import("@/server/dal/credit-notes");
  let docs: typeof import("@/server/dal/documents");
  let dash: typeof import("@/server/dal/dashboard");
  let verification: typeof import("@/server/dal/verification");
  let storage: typeof import("@/lib/storage").storage;
  let errors: typeof import("@/server/dal/errors");
  let profileId: string;
  let gbpProfileId: string;
  let clientId: string;
  const invoiceIds: string[] = [];

  const profileInput = (label: string, baseCurrency: string, format: string) =>
    ProfileInputSchema.parse({
      type: "INDIVIDUAL",
      label: `${tag} ${label}`,
      legalName: `${tag} ${label} Legal`,
      email: "me@example.com",
      address,
      countryCode: "IN",
      stateCode: "KA",
      gstStateCode: "29",
      gstin: "29ABCDE1234F1Z5",
      baseCurrency,
      locale: "en-IN",
      fiscalYearStartMonth: 4,
      invoiceNumberFormat: format,
      creditNoteNumberFormat: "RFC/{FY}/{SEQ:3}",
      defaultTaxRegime: "INDIA_GST",
      emailCc: [],
      emailBcc: [],
    });

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    inv = await import("@/server/dal/invoices");
    payments = await import("@/server/dal/payments");
    cns = await import("@/server/dal/credit-notes");
    docs = await import("@/server/dal/documents");
    dash = await import("@/server/dal/dashboard");
    verification = await import("@/server/dal/verification");
    errors = await import("@/server/dal/errors");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(actor, profileInput("issuer", "INR", "RF/{FY}/{SEQ:3}"));
    if (hadDefault)
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    profileId = p.id;
    const g = await profiles.createProfile(actor, profileInput("gbp", "GBP", "RFG/{FY}/{SEQ:3}"));
    await prisma.issuerProfile.update({ where: { id: g.id }, data: { isDefault: false } });
    gbpProfileId = g.id;
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
    await prisma.documentSequence.deleteMany({
      where: { issuerProfileId: { in: [profileId, gbpProfileId] } },
    });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: { in: [profileId, gbpProfileId] } } });
  });

  const draft = async (issuer = profileId, currency = "INR", qty = "1") => {
    const d = await inv.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: issuer,
        clientId,
        issueDate: "2026-05-01",
        dueDate: "2027-03-31",
        currency,
        taxRegime: "INDIA_GST",
        items: [
          {
            description: "Work",
            sacHsnCode: "998314",
            unitType: "HOUR",
            quantity: qty,
            unitPrice: "100",
            taxRate: "18",
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceIds.push(d.id);
    return d;
  };

  it("issuing the same draft twice at once allocates exactly one number, with no gap", async () => {
    const d = await draft();
    const results = await Promise.allSettled([
      inv.issueInvoice(actor, d.id),
      inv.issueInvoice(actor, d.id),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String((failed[0] as PromiseRejectedResult).reason)).toMatch(/draft/i);
    const after = await inv.getInvoice(actor, d.id);
    expect(after.number).toBe("RF/26-27/001");
    const seq = await prisma.documentSequence.findUniqueOrThrow({
      where: {
        issuerProfileId_kind_fiscalYear: {
          issuerProfileId: profileId,
          kind: "INVOICE",
          fiscalYear: "2026-27",
        },
      },
    });
    expect(seq.nextNumber).toBe(2);
    expect(
      await prisma.auditEvent.count({ where: { entityId: d.id, action: "invoice.issued" } }),
    ).toBe(1);
  });

  it("two concurrent full payments: exactly one is accepted", async () => {
    const i = await inv.issueInvoice(actor, (await draft()).id); // 118.00
    const full = PaymentInputSchema.parse({
      kind: "PAYMENT",
      paymentDate: "2026-05-20",
      amountApplied: "118",
    });
    const results = await Promise.allSettled([
      payments.recordPayment(actor, i.id, full),
      payments.recordPayment(actor, i.id, full),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await inv.getInvoice(actor, i.id);
    expect(after.amountPaid).toBe("118.00");
    expect(after.balanceDue).toBe("0.00");
  });

  it("an invoice with an issued credit note cannot be voided", async () => {
    const i = await inv.issueInvoice(actor, (await draft(profileId, "INR", "10")).id); // 1180
    const cn = await cns.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: i.id,
        reason: "Partial",
        subtotal: "100",
        issueDate: "2026-05-10",
      }),
    );
    await cns.issueCreditNote(actor, cn.id);
    await expect(inv.voidInvoice(actor, i.id, "mistake")).rejects.toThrow(/credit note/i);
    expect((await inv.getInvoice(actor, i.id)).status).toBe("ISSUED");
  });

  it("a duplicate number is an invariant error that names the format, not a crash", async () => {
    await prisma.issuerProfile.update({
      where: { id: profileId },
      data: { invoiceNumberFormat: "RF/{FY}/FIXED" },
    });
    try {
      await inv.issueInvoice(actor, (await draft()).id);
      const second = inv.issueInvoice(actor, (await draft()).id);
      await expect(second).rejects.toBeInstanceOf(errors.InvariantError);
      await expect(second).rejects.toThrow(/already exists|number format/i);
    } finally {
      await prisma.issuerProfile.update({
        where: { id: profileId },
        data: { invoiceNumberFormat: "RF/{FY}/{SEQ:3}" },
      });
    }
  });

  it("adopts a blob whose Document row went missing instead of failing forever", async () => {
    const i = await inv.issueInvoice(actor, (await draft()).id);
    const first = await docs.ensureDocument("INVOICE", i.id);
    await prisma.document.delete({ where: { id: first.id } }); // the crash between put and insert
    expect(await storage.exists(first.storageKey)).toBe(true);
    const again = await docs.ensureDocument("INVOICE", i.id);
    expect(again.storageKey).toBe(first.storageKey);
    expect(again.sha256).toBe(first.sha256);
    expect(again.version).toBe(1);
  });

  it("dashboard base-currency figures ignore profiles with another base currency", async () => {
    const before = await dash.dashboardData(actor);
    expect(before.baseCurrency).toBe("INR");
    await inv.issueInvoice(actor, (await draft(gbpProfileId, "GBP", "50")).id); // 5900 GBP
    const after = await dash.dashboardData(actor);
    expect(after.billedThisFy).toBe(before.billedThisFy);
    expect(after.receivedThisFy).toBe(before.receivedThisFy);
    const scoped = await dash.dashboardData(actor, { issuerProfileId: gbpProfileId });
    expect(scoped.baseCurrency).toBe("GBP");
    expect(scoped.billedThisFy).toBe("5900.00");
  });

  it("a regenerated credit note is named after its number and audited in the same transaction", async () => {
    const i = await inv.issueInvoice(actor, (await draft(profileId, "INR", "10")).id);
    const cn = await cns.issueCreditNote(
      actor,
      (
        await cns.createCreditNoteDraft(
          actor,
          CreditNoteInputSchema.parse({
            invoiceId: i.id,
            reason: "Regenerate",
            subtotal: "100",
            issueDate: "2026-05-10",
          }),
        )
      ).id,
    );
    await docs.ensureDocument("CREDIT_NOTE", cn.id);
    const v2 = await docs.regenerateDocument(actor, "CREDIT_NOTE", cn.id);
    expect(v2.version).toBe(2);
    expect(v2.filename).toBe(`${cn.number!.replaceAll("/", "-")}-v2.pdf`);
    const audits = await prisma.auditEvent.findMany({
      where: { entityType: "Document", entityId: v2.id, action: "document.regenerated" },
    });
    expect(audits).toHaveLength(1);
  });

  it("the email DAL refuses to send a voided document, whatever the UI shows", async () => {
    const emails = await import("@/server/dal/emails");
    const i = await inv.issueInvoice(actor, (await draft()).id);
    await inv.voidInvoice(actor, i.id, "sent in error");
    await expect(emails.composerDefaults(actor, "INVOICE", i.id)).rejects.toThrow(/void/i);
    await expect(
      emails.sendDocumentEmail(actor, {
        kind: "INVOICE",
        id: i.id,
        to: ["client@example.com"],
        cc: [],
        bcc: [],
        subject: "x",
        body: "y",
      }),
    ).rejects.toThrow(/void/i);
  });

  it("payments and credit notes cannot be dated before the invoice was issued", async () => {
    const i = await inv.issueInvoice(actor, (await draft(profileId, "INR", "10")).id); // 2026-05-01
    await expect(
      payments.recordPayment(
        actor,
        i.id,
        PaymentInputSchema.parse({
          kind: "PAYMENT",
          paymentDate: "2026-04-30",
          amountApplied: "10",
        }),
      ),
    ).rejects.toThrow(/before the invoice/i);
    await expect(
      cns.createCreditNoteDraft(
        actor,
        CreditNoteInputSchema.parse({
          invoiceId: i.id,
          reason: "Too early",
          subtotal: "10",
          issueDate: "2026-04-30",
        }),
      ),
    ).rejects.toThrow(/before the invoice/i);
  });

  it("issue requires an explicit exchange rate when the invoice currency differs from the base", async () => {
    const usd = await draft(profileId, "USD"); // INR profile, fxRateToBase defaults to 1
    await expect(inv.issueInvoice(actor, usd.id)).rejects.toThrow(/exchange rate/i);
    await inv.updateDraft(
      actor,
      usd.id,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-05-01",
        dueDate: "2027-03-31",
        currency: "USD",
        fxRateToBase: "83.5",
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
    expect((await inv.issueInvoice(actor, usd.id)).fxRateToBase).toBe("83.5");
  });

  it("issue refuses an archived issuer or client", async () => {
    const clients = await import("@/server/dal/clients");
    const d = await draft();
    await clients.archiveClient(actor, clientId);
    try {
      await expect(inv.issueInvoice(actor, d.id)).rejects.toThrow(/archived/i);
    } finally {
      await clients.unarchiveClient(actor, clientId);
    }
  });

  it("crediting the whole taxable amount of a rounded invoice closes the balance exactly", async () => {
    // 10 h × 99.99 = 999.90; GST 18 % = 89.99 + 89.99 → 1179.88; rounded up by 0.12 to 1180.00.
    const d = await inv.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-05-01",
        dueDate: "2027-03-31",
        currency: "INR",
        taxRegime: "INDIA_GST",
        roundingAdjustment: "0.12",
        items: [
          {
            description: "Work",
            sacHsnCode: "998314",
            unitType: "HOUR",
            quantity: "10",
            unitPrice: "99.99",
            taxRate: "18",
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceIds.push(d.id);
    const i = await inv.issueInvoice(actor, d.id);
    expect(i.total).toBe("1180.00");
    const cn = await cns.issueCreditNote(
      actor,
      (
        await cns.createCreditNoteDraft(
          actor,
          CreditNoteInputSchema.parse({
            invoiceId: i.id,
            reason: "Cancelled in full",
            subtotal: "999.90",
            issueDate: "2026-05-10",
          }),
        )
      ).id,
    );
    expect(cn.roundingAdjustment).toBe("0.12");
    expect(cn.total).toBe("1180.00");
    const after = await inv.getInvoice(actor, i.id);
    expect(after.balanceDue).toBe("0.00");
    expect(after.displayStatus).toBe("PAID");
  });

  it("credit-note tokens: a draft never resolves, an issued one resolves as a credit note", async () => {
    const i = await inv.issueInvoice(actor, (await draft(profileId, "INR", "10")).id);
    const cn = await cns.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: i.id,
        reason: "Verify",
        subtotal: "100",
        issueDate: "2026-05-10",
      }),
    );
    expect(await verification.lookupByToken(cn.verificationToken)).toBeNull();
    const issued = await cns.issueCreditNote(actor, cn.id);
    expect(await verification.lookupByToken(cn.verificationToken)).toBeNull(); // rotated at issue
    const r = await verification.lookupByToken(issued.verificationToken);
    expect(r).toMatchObject({ kind: "CREDIT_NOTE", number: issued.number, status: "valid" });
    expect(JSON.stringify(r)).not.toMatch(/amountPaid|balanceDue/);
  });
});
