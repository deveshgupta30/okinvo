import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

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
const editor: Actor = { ...owner, role: "EDITOR" };
const tag = `einv-${Date.now()}`;

/**
 * Settings → E-invoicing (spec §9e): NIC credentials are stored only as ciphertext, read back
 * decrypted for the connector, redacted in the owner's view and in the audit diff; editors are
 * refused.
 */
describe.skipIf(!url)("e-invoice settings", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let dal: typeof import("@/server/dal/einvoice-settings");
  let previous: unknown = null;
  let profileId: string;

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    dal = await import("@/server/dal/einvoice-settings");
    previous = (await prisma.appSetting.findUnique({ where: { key: "einvoice" } }))?.value ?? null;
    const profiles = await import("@/server/dal/profiles");
    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      owner,
      ProfileInputSchema.parse({
        type: "COMPANY",
        label: `${tag} issuer`,
        legalName: `${tag} Ltd`,
        email: "me@example.com",
        address: { line1: "1 Test Street", city: "Bengaluru", countryCode: "IN" },
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
        electronicAddress: "0088:1234567890128",
        electronicAddressScheme: "0088",
        einvoiceEnabled: "on",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault && p.isDefault) {
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    }
    profileId = p.id;
  });

  afterAll(async () => {
    if (previous === null) await prisma.appSetting.deleteMany({ where: { key: "einvoice" } });
    else
      await prisma.appSetting.update({
        where: { key: "einvoice" },
        data: { value: previous as object },
      });
    await prisma.auditEvent.deleteMany({
      where: { entityType: "AppSetting", entityId: "einvoice" },
    });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  it("keeps the issuer's electronic address and switch on the profile", async () => {
    const row = await prisma.issuerProfile.findUniqueOrThrow({ where: { id: profileId } });
    expect(row.electronicAddress).toBe("0088:1234567890128");
    expect(row.electronicAddressScheme).toBe("0088");
    expect(row.einvoiceEnabled).toBe(true);
  });

  it("stores NIC credentials encrypted, reads them back decrypted and redacts the view", async () => {
    const saved = await dal.saveEInvoiceProfileSettings(owner, {
      profileId,
      indiaConnector: "nic",
      nicEnv: "sandbox",
      nicClientId: "client-1",
      nicClientSecret: "s3cret-value",
      nicUsername: "api-user",
      nicPassword: "p4ssword-value",
      nicGstin: "29ABCDE1234F1Z5",
      nicPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
      euProfile: "EN16931",
    });
    expect(saved.india?.nic?.hasClientSecret).toBe(true);
    expect(saved.india?.nic?.hasPassword).toBe(true);
    expect(saved.india?.nic?.baseUrl).toBe("https://einv-apisandbox.nic.in");
    expect(JSON.stringify(saved)).not.toContain("s3cret-value");

    const raw = JSON.stringify(
      (await prisma.appSetting.findUniqueOrThrow({ where: { key: "einvoice" } })).value,
    );
    expect(raw).not.toContain("s3cret-value");
    expect(raw).not.toContain("p4ssword-value");
    expect(raw).toContain("clientSecretEnc");

    const creds = await dal.resolveNicCredentials(profileId);
    expect(creds?.clientSecret).toBe("s3cret-value");
    expect(creds?.password).toBe("p4ssword-value");
    expect(creds?.gstin).toBe("29ABCDE1234F1Z5");
    expect(creds?.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(await dal.euProfileFor(profileId)).toBe("EN16931");

    const events = await prisma.auditEvent.findMany({
      where: { entityType: "AppSetting", entityId: "einvoice" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const payload = JSON.stringify(events[0]);
    expect(payload).toContain("[redacted]");
    expect(payload).not.toContain("s3cret-value");
    expect(payload).not.toContain("p4ssword-value");
  });

  it("keeps the stored secrets when the form leaves them blank and drops them when switched off", async () => {
    const kept = await dal.saveEInvoiceProfileSettings(owner, {
      profileId,
      indiaConnector: "nic",
      nicEnv: "production",
      nicClientId: "client-2",
      nicUsername: "api-user",
      nicGstin: "29ABCDE1234F1Z5",
    });
    expect(kept.india?.nic?.env).toBe("production");
    expect(kept.india?.nic?.baseUrl).toBe("https://einvoice1.gst.gov.in");
    expect((await dal.resolveNicCredentials(profileId))?.clientSecret).toBe("s3cret-value");

    const off = await dal.saveEInvoiceProfileSettings(owner, {
      profileId,
      indiaConnector: "manual",
    });
    expect(off.india).toEqual({ connector: "manual" });
    expect(off.eu).toBeUndefined();
    expect(await dal.resolveNicCredentials(profileId)).toBeNull();
  });

  it("refuses editors and viewers", async () => {
    await expect(dal.getEInvoiceSettings(editor, [profileId])).rejects.toThrow();
    await expect(
      dal.saveEInvoiceProfileSettings(editor, { profileId, indiaConnector: "manual" }),
    ).rejects.toThrow();
  });
});
