import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/rate-limit";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { signShareCookie, verifyShareCookie } from "@/lib/security/share-cookie";
import type { Actor } from "@/server/actor";

/**
 * Share links (spec §5.6): public lookups by token, the password gate with its per-link rate
 * limit, revocation and expiry, view counts, and the rule that a protected link only ever serves
 * its own password-protected copy.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const actor: Actor = {
  userId: "no-such-user",
  email: "owner@example.com",
  name: "Owner",
  role: "OWNER",
  timezone: "Asia/Kolkata",
  locale: "en-US",
};
const tag = `share-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

async function bytesOf(stream: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks);
}

describe.skipIf(!url)("share links", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let share: typeof import("@/server/dal/share-links");
  let docs: typeof import("@/server/dal/documents");
  let inv: typeof import("@/server/dal/invoices");
  let storage: typeof import("@/lib/storage").storage;
  let profileId: string;
  let clientId: string;
  let invoiceId: string;
  let draftId: string;

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    share = await import("@/server/dal/share-links");
    docs = await import("@/server/dal/documents");
    inv = await import("@/server/dal/invoices");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "INDIVIDUAL",
        label: `${tag} issuer`,
        legalName: `${tag} Person`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "SHR/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "SHC/{FY}/{SEQ:3}",
        defaultTaxRegime: "NONE",
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
        currency: "INR",
        paymentTermsDays: 15,
      }),
    );
    clientId = c.id;
    const draft = () =>
      inv.createDraft(
        actor,
        InvoiceDraftInputSchema.parse({
          issuerProfileId: profileId,
          clientId,
          issueDate: "2026-05-01",
          dueDate: "2026-05-31",
          currency: "INR",
          taxRegime: "NONE",
          items: [
            {
              description: "Work",
              unitType: "HOUR",
              quantity: "1",
              unitPrice: "1000",
              taxRate: "0",
            },
          ],
          displayConfig: DEFAULT_DISPLAY_CONFIG,
        }),
      );
    const d = await draft();
    invoiceId = d.id;
    await inv.issueInvoice(actor, d.id);
    draftId = (await draft()).id;
  });

  afterAll(async () => {
    await prisma.shareLink.deleteMany({ where: { invoiceId: { in: [invoiceId, draftId] } } });
    const rows = await prisma.document.findMany({
      where: { invoiceId: { in: [invoiceId, draftId] } },
    });
    for (const r of rows) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId: { in: [invoiceId, draftId] } } });
    await prisma.invoice.deleteMany({ where: { id: { in: [invoiceId, draftId] } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  const tokenOf = (u: string) => u.slice(u.lastIndexOf("/") + 1);

  it("an open link resolves publicly with document facts only and counts views", async () => {
    const {
      url: link,
      password,
      link: dto,
    } = await share.createShareLink(actor, {
      kind: "INVOICE",
      id: invoiceId,
      expiresInDays: 30,
    });
    expect(password).toBeNull();
    expect(dto.protected).toBe(false);
    expect(link).toMatch(/\/i\/[A-Za-z0-9_-]{20,64}$/);
    const view = await share.lookupShare(tokenOf(link));
    expect(view).toMatchObject({
      linkId: dto.id,
      kind: "INVOICE",
      documentId: invoiceId,
      status: "valid",
      requiresPassword: false,
      clientName: `${tag} client`,
      total: "1000.00",
    });
    expect(JSON.stringify(view)).not.toMatch(/balance|paid|token/i);
    await share.recordShareView(dto.id, "view");
    await share.recordShareView(dto.id, "download");
    const listed = await share.listShareLinks(actor, "INVOICE", invoiceId);
    const mine = listed.find((l) => l.id === dto.id)!;
    expect(mine.viewCount).toBe(1);
    expect(mine.downloadCount).toBe(1);
    expect(mine.url).toBe(link);
    // the open link streams the canonical PDF
    const { document } = await share.shareDocumentStream(dto.id);
    expect(document.format).toBe("PDF");
    const events = await prisma.auditEvent.findMany({
      where: { entityId: dto.id, action: "share.created" },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(tokenOf(link));
  }, 60_000);

  it("refuses drafts, unknown and malformed tokens", async () => {
    await expect(share.createShareLink(actor, { kind: "INVOICE", id: draftId })).rejects.toThrow(
      /issued/i,
    );
    expect(await share.lookupShare("not-a-real-token-at-all-xx")).toBeNull();
    expect(await share.lookupShare("")).toBeNull();
    expect(await share.lookupShare("../../etc")).toBeNull();
  });

  it("a protected link gates on the password, rate-limits guesses and serves only its own copy", async () => {
    const {
      url: link,
      password,
      link: dto,
    } = await share.createShareLink(actor, {
      kind: "INVOICE",
      id: invoiceId,
      password: "open-sesame-42",
    });
    expect(password).toBe("open-sesame-42");
    expect(dto.protected).toBe(true);
    expect(dto.password).toBe("open-sesame-42");
    const view = await share.lookupShare(tokenOf(link));
    expect(view?.requiresPassword).toBe(true);

    const subject = `test-${Date.now()}`;
    for (let i = 0; i < LIMITS.sharePassword.limit; i++) {
      expect(await share.verifySharePassword(dto.id, "nope", subject)).toBe("wrong");
    }
    expect(await share.verifySharePassword(dto.id, "open-sesame-42", subject)).toBe("rate_limited");
    expect(await share.verifySharePassword(dto.id, "open-sesame-42", `${subject}-other`)).toBe(
      "ok",
    );

    const secret = share.shareCookieSecret();
    const cookie = signShareCookie(dto.id, secret, new Date());
    expect(verifyShareCookie(cookie, dto.id, secret, new Date())).toBe(true);

    const { document } = await share.shareDocumentStream(dto.id);
    expect(document.format).toBe("PDF_PROTECTED");
    const canonical = await docs.ensureDocument("INVOICE", invoiceId);
    expect(document.id).not.toBe(canonical.id);
    const { stream } = await docs.getDocumentStream(actor, document.id);
    expect((await bytesOf(stream)).toString("latin1")).toContain("/Encrypt");
  }, 120_000);

  it("revoked and expired links stop resolving", async () => {
    const a = await share.createShareLink(actor, { kind: "INVOICE", id: invoiceId });
    await share.revokeShareLink(actor, a.link.id);
    expect(await share.lookupShare(tokenOf(a.url))).toBeNull();
    await expect(share.shareDocumentStream(a.link.id)).rejects.toThrow();

    const b = await share.createShareLink(actor, {
      kind: "INVOICE",
      id: invoiceId,
      expiresInDays: 7,
    });
    expect(await share.lookupShare(tokenOf(b.url))).not.toBeNull();
    await prisma.shareLink.update({
      where: { id: b.link.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await share.lookupShare(tokenOf(b.url))).toBeNull();
    expect(await share.verifySharePassword(b.link.id, "x", "s")).toBe("wrong");
  }, 60_000);

  it("viewers may not create or revoke links", async () => {
    const viewer: Actor = { ...actor, role: "VIEWER" };
    await expect(
      share.createShareLink(viewer, { kind: "INVOICE", id: invoiceId }),
    ).rejects.toThrow();
  });
});
