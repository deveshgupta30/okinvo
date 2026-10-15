import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

const url = process.env.DATABASE_URL;
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

async function mailpitUp(): Promise<boolean> {
  try {
    const r = await fetch(`${mailpit}/api/v1/info`);
    return r.ok;
  } catch {
    return false;
  }
}
const ready = url ? await mailpitUp() : false;

const actor: Actor = {
  userId: "no-such-user",
  email: "o@example.com",
  name: "O",
  role: "OWNER",
  timezone: "UTC",
  locale: "en-US",
};
const tag = `mail-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!ready)("sending documents by email", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let emails: typeof import("@/server/dal/emails");
  let smtp: typeof import("@/server/dal/smtp-settings");
  let inv: typeof import("@/server/dal/invoices");
  let storage: typeof import("@/lib/storage").storage;
  let profileId: string;
  let clientId: string;
  let previousSmtp: unknown = null;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    emails = await import("@/server/dal/emails");
    smtp = await import("@/server/dal/smtp-settings");
    inv = await import("@/server/dal/invoices");
    previousSmtp = (await prisma.appSetting.findUnique({ where: { key: "smtp" } }))?.value ?? null;
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "INDIVIDUAL",
        label: `${tag} issuer`,
        legalName: `${tag} Legal`,
        email: "issuer@test.local",
        address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        gstin: "29ABCDE1234F1Z5",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "MAIL/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: ["cc@test.local"],
        emailBcc: [],
        emailInvoiceSubject: "Invoice {{number}} from {{issuerName}}",
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
          email: "client@test.local",
          contactPerson: "Priya",
          billingAddress: address,
          countryCode: "IN",
          stateCode: "KA",
          gstStateCode: "29",
          currency: "INR",
          paymentTermsDays: 15,
        }),
      )
    ).id;
  });

  afterAll(async () => {
    if (previousSmtp) {
      await prisma.appSetting.upsert({
        where: { key: "smtp" },
        create: { key: "smtp", value: previousSmtp as object },
        update: { value: previousSmtp as object },
      });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: "smtp" } });
    }
    await prisma.emailMessage.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    const rows = await prisma.document.findMany({ where: { invoiceId: { in: invoiceIds } } });
    for (const r of rows) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  it("drafts from the templates, delivers with the stored PDF attached, logs it and sets sentAt once", async () => {
    await smtp.saveSmtpSettings(actor, {
      host: "127.0.0.1",
      port: Number(process.env.MAILPIT_SMTP_PORT ?? 2525), // compose.dev.yml DEV_SMTP_PORT
      security: "none",
      from: "okinvo@test.local",
      fromName: "okinvo test",
    });
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
            quantity: "1",
            unitPrice: "1000",
            taxRate: "18",
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceIds.push(d.id);
    const issued = await inv.issueInvoice(actor, d.id);
    const defaults = await emails.composerDefaults(actor, "INVOICE", d.id);
    expect(defaults.smtpAvailable).toBe(true);
    expect(defaults.to).toEqual(["client@test.local"]);
    expect(defaults.cc).toEqual(["cc@test.local"]);
    expect(defaults.subject).toBe(`Invoice ${issued.number} from ${tag} Legal`);
    expect(defaults.body).toContain("Priya");
    expect(defaults.attachmentName).toBe(`${issued.number!.replace(/\//g, "-")}.pdf`);

    const sent = await emails.sendDocumentEmail(actor, {
      kind: "INVOICE",
      id: d.id,
      to: defaults.to,
      cc: defaults.cc,
      bcc: [],
      subject: defaults.subject,
      body: defaults.body,
    });
    expect(sent.status).toBe("SENT");
    expect(sent.providerMessageId).toBeTruthy();
    const after = await inv.getInvoice(actor, d.id);
    expect(after.sentAt).not.toBeNull();

    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`subject:"${defaults.subject}"`)}`,
    ).then(
      (r) =>
        r.json() as Promise<{
          messages: { ID: string; Attachments: number; To: { Address: string }[] }[];
        }>,
    );
    const msg = search.messages[0];
    expect(msg).toBeTruthy();
    expect(msg!.To.map((t) => t.Address)).toContain("client@test.local");
    expect(msg!.Attachments).toBe(1);
    const full = await fetch(`${mailpit}/api/v1/message/${msg!.ID}`).then(
      (r) =>
        r.json() as Promise<{
          Attachments: { FileName: string; ContentType: string }[];
          Text: string;
          HTML: string;
        }>,
    );
    expect(full.Attachments[0]?.FileName).toBe(defaults.attachmentName);
    expect(full.Attachments[0]?.ContentType).toContain("pdf");
    expect(full.HTML).toContain("<p>");

    // A second send keeps the first sentAt and adds a second log row.
    const again = await emails.sendDocumentEmail(actor, {
      kind: "INVOICE",
      id: d.id,
      to: ["other@test.local"],
      cc: [],
      bcc: [],
      subject: "Again",
      body: "Second",
    });
    expect(again.status).toBe("SENT");
    expect((await inv.getInvoice(actor, d.id)).sentAt).toBe(after.sentAt);
    const log = await emails.listEmailMessages(actor, { kind: "INVOICE", id: d.id });
    expect(log).toHaveLength(2);
    expect(log.every((m) => m.documentId)).toBe(true);

    // An unreachable server is logged as FAILED with the error, never thrown to the caller.
    await smtp.saveSmtpSettings(actor, {
      host: "127.0.0.1",
      port: 9,
      security: "none",
      from: "okinvo@test.local",
    });
    const failed = await emails.sendDocumentEmail(actor, {
      kind: "INVOICE",
      id: d.id,
      to: ["x@test.local"],
      cc: [],
      bcc: [],
      subject: "Fail",
      body: "Fail",
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toBeTruthy();

    // Without any SMTP the composer offers the mail-app flow and manual marking.
    await smtp.clearSmtpSettings(actor);
    const noSmtp = await emails.composerDefaults(actor, "INVOICE", d.id);
    expect(noSmtp.smtpAvailable).toBe(Boolean(process.env.SMTP_HOST));
    expect(noSmtp.mailto.startsWith("mailto:client@test.local?")).toBe(true);
    const manual = await emails.markSentManually(actor, "INVOICE", d.id);
    expect(manual.status).toBe("MANUAL");
  }, 120_000);
});
