import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { PaymentMethodInputSchema } from "@/lib/schemas/payment-method-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { ServiceInputSchema } from "@/lib/schemas/service-input";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const actor: Actor = {
  userId: "no-such-user",
  email: "owner@example.com",
  name: "Owner",
  role: "OWNER",
  timezone: "Asia/Kolkata",
};
const tag = `md-${Date.now()}`;

const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("master data DAL", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let profiles: typeof import("@/server/dal/profiles");
  let clients: typeof import("@/server/dal/clients");
  let services: typeof import("@/server/dal/services");
  let methods: typeof import("@/server/dal/payment-methods");
  const created = {
    profiles: [] as string[],
    clients: [] as string[],
    services: [] as string[],
    methods: [] as string[],
  };

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    profiles = await import("@/server/dal/profiles");
    clients = await import("@/server/dal/clients");
    services = await import("@/server/dal/services");
    methods = await import("@/server/dal/payment-methods");
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { poReference: tag } });
    await prisma.paymentMethodProfile.deleteMany({ where: { id: { in: created.methods } } });
    await prisma.serviceItem.deleteMany({ where: { id: { in: created.services } } });
    await prisma.client.deleteMany({ where: { id: { in: created.clients } } });
    await prisma.issuerProfile.deleteMany({ where: { id: { in: created.profiles } } });
    await prisma.auditEvent.deleteMany({
      where: {
        entityId: {
          in: [...created.profiles, ...created.clients, ...created.services, ...created.methods],
        },
      },
    });
  });

  const profileInput = (label: string) => ({
    type: "INDIVIDUAL" as const,
    label,
    legalName: `${tag} ${label}`,
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
    defaultTaxRegime: "INDIA_GST" as const,
    defaultTdsRate: "10",
    emailCc: [],
    emailBcc: [],
  });

  it("makes the first profile default, later ones not, and swaps defaults atomically", async () => {
    // A pre-existing default from another test run must not break this: clear it temporarily.
    const existingDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    if (existingDefault)
      await prisma.issuerProfile.update({
        where: { id: existingDefault.id },
        data: { isDefault: false },
      });
    try {
      const a = await profiles.createProfile(actor, ProfileInputSchema.parse(profileInput("A")));
      const b = await profiles.createProfile(actor, ProfileInputSchema.parse(profileInput("B")));
      created.profiles.push(a.id, b.id);
      expect(a.isDefault).toBe(true);
      expect(b.isDefault).toBe(false);
      await profiles.setDefaultProfile(actor, b.id);
      expect((await profiles.getProfile(actor, a.id)).isDefault).toBe(false);
      expect((await profiles.getProfile(actor, b.id)).isDefault).toBe(true);
      expect(
        await prisma.auditEvent.count({ where: { entityId: a.id, action: "profile.created" } }),
      ).toBe(1);
    } finally {
      if (existingDefault) {
        await prisma.issuerProfile.updateMany({
          where: { id: { in: created.profiles } },
          data: { isDefault: false },
        });
        await prisma.issuerProfile.update({
          where: { id: existingDefault.id },
          data: { isDefault: true },
        });
      }
    }
  });

  it("encrypts the US tax id at rest and returns it decrypted only on request", async () => {
    const p = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        ...profileInput("US"),
        countryCode: "US",
        gstin: undefined,
        gstStateCode: undefined,
        panNumber: undefined,
        usTaxId: "12-3456789",
        defaultTaxRegime: "US_SALES_TAX",
      }),
    );
    created.profiles.push(p.id);
    const row = await prisma.issuerProfile.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.usTaxIdEnc?.startsWith("v1.")).toBe(true);
    expect(row.usTaxIdEnc).not.toContain("3456789");
    expect((await profiles.getProfile(actor, p.id)).usTaxId).toBe("12-3456789");
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: p.id, action: "profile.created" },
    });
    expect(JSON.stringify(audit.after)).not.toContain("3456789");
  });

  it("archives (never deletes) profiles and clients that have invoices", async () => {
    const p = await profiles.createProfile(actor, ProfileInputSchema.parse(profileInput("Busy")));
    const c = await clients.createClient(
      actor,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
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
    created.profiles.push(p.id);
    created.clients.push(c.id);
    await prisma.invoice.create({
      data: {
        issuerProfileId: p.id,
        clientId: c.id,
        status: "ISSUED",
        number: `${tag}/001`,
        issueDate: new Date("2026-04-01T00:00:00Z"),
        dueDate: new Date("2026-04-16T00:00:00Z"),
        currency: "INR",
        taxRegime: "INDIA_GST",
        displayConfig: {},
        verificationToken: `${tag}-tok`,
        poReference: tag,
      },
    });
    await expect(profiles.deleteProfile(actor, p.id)).rejects.toThrow(/archive it instead/i);
    await expect(clients.deleteClient(actor, c.id)).rejects.toThrow(/archive it instead/i);
    await expect(profiles.archiveProfile(actor, p.id)).resolves.toBeUndefined();
    await expect(clients.archiveClient(actor, c.id)).resolves.toBeUndefined();
    expect((await profiles.listProfiles(actor, {})).some((x) => x.id === p.id)).toBe(false);
    expect((await clients.listClients(actor, {})).some((x) => x.id === c.id)).toBe(false);
    expect(
      (await clients.listClients(actor, { includeArchived: true })).some((x) => x.id === c.id),
    ).toBe(true);
    // Archived rows stay loadable by id so existing documents and edit screens keep working.
    expect((await clients.getClient(actor, c.id)).archivedAt).not.toBeNull();
    const idle = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse(profileInput("Idle")),
    );
    await profiles.deleteProfile(actor, idle.id);
    await expect(profiles.getProfile(actor, idle.id)).rejects.toThrow(/not found/i);
  });

  it("stores payment-method details encrypted and lists them decrypted for printing", async () => {
    const m = await methods.createPaymentMethod(
      actor,
      PaymentMethodInputSchema.parse({
        name: `${tag} bank`,
        type: "BANK_TRANSFER",
        currency: "INR",
        details: {
          type: "BANK_TRANSFER",
          accountHolder: "Me",
          accountNumber: "000111222333",
          ifsc: "HDFC0001234",
          bankName: "HDFC",
        },
        instructions: "Pay within terms",
        isDefault: false,
        isActive: true,
      }),
    );
    created.methods.push(m.id);
    const row = await prisma.paymentMethodProfile.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.detailsEnc.startsWith("v1.")).toBe(true);
    expect(row.detailsEnc).not.toContain("000111222333");
    const full = await methods.getPaymentMethod(actor, m.id);
    expect(full.details).toMatchObject({ type: "BANK_TRANSFER", accountNumber: "000111222333" });
    const upi = await methods.createPaymentMethod(
      actor,
      PaymentMethodInputSchema.parse({
        name: `${tag} upi`,
        type: "UPI",
        details: { type: "UPI", vpa: "me@okbank" },
        isDefault: false,
        isActive: true,
      }),
    );
    created.methods.push(upi.id);
    const listed = await methods.listPaymentMethods(actor, { decrypt: true });
    expect(listed.find((x) => x.id === upi.id)?.details).toEqual({ type: "UPI", vpa: "me@okbank" });
  });

  it("creates, updates, deactivates and archives services with audit rows", async () => {
    const s = await services.createService(
      actor,
      ServiceInputSchema.parse({
        name: `${tag} Design`,
        unitType: "HOUR",
        defaultRate: "2500.00",
        currency: "INR",
        sacHsnCode: "998314",
        defaultTaxRate: "18",
        isActive: true,
      }),
    );
    created.services.push(s.id);
    expect(s.defaultRate).toBe("2500.00");
    const updated = await services.updateService(
      actor,
      s.id,
      ServiceInputSchema.parse({
        ...s,
        description: "UI design",
        defaultRate: "3000",
        isActive: false,
      }),
    );
    expect(updated.defaultRate).toBe("3000.00");
    expect(updated.isActive).toBe(false);
    const events = await prisma.auditEvent.findMany({
      where: { entityId: s.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual(["service.created", "service.updated"]);
    expect(events[1]?.after).toMatchObject({ defaultRate: "3000.00", isActive: false });
    await services.archiveService(actor, s.id);
    expect((await services.listServices(actor, {})).some((x) => x.id === s.id)).toBe(false);
  });
});
