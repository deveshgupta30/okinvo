import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/crypto";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { CreditNoteInputSchema } from "@/lib/schemas/credit-note-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { PaymentMethodInputSchema } from "@/lib/schemas/payment-method-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

/**
 * What the database holds for the sensitive bits: verification tokens only as SHA-256 hashes (the
 * plaintext lives encrypted so links can be rebuilt), payment-method snapshots encrypted with the
 * field key, and the data export keeping both out.
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
const tag = `sar-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};
const ACCOUNT = "000111222333444";

describe.skipIf(!url)("secrets at rest", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let inv: typeof import("@/server/dal/invoices");
  let cns: typeof import("@/server/dal/credit-notes");
  let verification: typeof import("@/server/dal/verification");
  let profileId: string;
  let clientId: string;
  let methodId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    inv = await import("@/server/dal/invoices");
    cns = await import("@/server/dal/credit-notes");
    verification = await import("@/server/dal/verification");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const methods = await import("@/server/dal/payment-methods");
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
        invoiceNumberFormat: "SAR/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "SRC/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault)
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    profileId = p.id;
    clientId = (
      await clients.createClient(
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
      )
    ).id;
    methodId = (
      await methods.createPaymentMethod(
        actor,
        PaymentMethodInputSchema.parse({
          name: `${tag} bank`,
          type: "BANK_TRANSFER",
          currency: "INR",
          details: {
            type: "BANK_TRANSFER",
            accountHolder: "Me",
            accountNumber: ACCOUNT,
            ifsc: "HDFC0001234",
            bankName: "HDFC",
          },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({
      where: {
        OR: [{ invoiceId: { in: invoiceIds } }, { creditNote: { invoiceId: { in: invoiceIds } } }],
      },
    });
    await prisma.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoicePaymentMethod.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.paymentMethodProfile.deleteMany({ where: { id: methodId } });
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
        paymentMethodIds: [methodId],
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
    return inv.issueInvoice(actor, d.id);
  };

  it("stores verification tokens hashed; the link still resolves from the plaintext", async () => {
    const i = await issued();
    expect(i.verificationToken).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } });
    expect(row.verificationToken).toBe(sha256Hex(i.verificationToken));
    expect(row.verificationToken).not.toBe(i.verificationToken);
    expect(row.verificationTokenEnc).toMatch(/^v1\./);
    expect((await verification.lookupByToken(i.verificationToken))?.number).toBe(i.number);
    // The stored hash is not itself a usable token.
    expect(await verification.lookupByToken(row.verificationToken)).toBeNull();
    // Same for credit notes.
    const cn = await cns.issueCreditNote(
      actor,
      (
        await cns.createCreditNoteDraft(
          actor,
          CreditNoteInputSchema.parse({
            invoiceId: i.id,
            reason: "x",
            subtotal: "100",
            issueDate: "2026-05-10",
          }),
        )
      ).id,
    );
    const cnRow = await prisma.creditNote.findUniqueOrThrow({ where: { id: cn.id } });
    expect(cnRow.verificationToken).toBe(sha256Hex(cn.verificationToken));
    expect((await verification.lookupByToken(cn.verificationToken))?.kind).toBe("CREDIT_NOTE");
  });

  it("encrypts the payment-method snapshot at rest and decrypts it for the DTO", async () => {
    const i = await issued();
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } });
    expect(row.paymentMethodsSnapshotEnc).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain(ACCOUNT);
    expect(JSON.stringify(i.paymentMethodsSnapshot)).toContain(ACCOUNT);
    expect(i.paymentMethodsSnapshot?.[0]?.name).toBe(`${tag} bank`);
  });

  it("keeps the encrypted columns out of the all-data snapshot", async () => {
    const { EXCLUDED_FIELDS } = await import("@/server/exports/all-data");
    expect(EXCLUDED_FIELDS).toEqual(
      expect.arrayContaining(["paymentMethodsSnapshotEnc", "verificationTokenEnc"]),
    );
  });

  it("answers malformed tokens the same way as unknown ones", async () => {
    expect(await verification.lookupByToken("not a token")).toBeNull();
    expect(await verification.lookupByToken("A".repeat(43))).toBeNull();
  });
});
