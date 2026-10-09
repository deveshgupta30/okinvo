import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_CONFIG,
  mergeTemplateConfig,
  DEFAULT_DISPLAY_CONFIG,
} from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
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
const tag = `tpl-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("template settings", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let templates: typeof import("@/server/dal/templates");
  let inv: typeof import("@/server/dal/invoices");
  let docs: typeof import("@/server/dal/documents");
  let storage: typeof import("@/lib/storage").storage;
  let previousSetting: unknown = null;
  let profileId: string;
  let clientId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    templates = await import("@/server/dal/templates");
    inv = await import("@/server/dal/invoices");
    docs = await import("@/server/dal/documents");
    previousSetting =
      (await prisma.appSetting.findUnique({ where: { key: "documentTemplate" } }))?.value ?? null;
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
        invoiceNumberFormat: "TPL/{FY}/{SEQ:3}",
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
    if (previousSetting) {
      await prisma.appSetting.upsert({
        where: { key: "documentTemplate" },
        create: { key: "documentTemplate", value: previousSetting as object },
        update: { value: previousSetting as object },
      });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: "documentTemplate" } });
    }
    const rows = await prisma.document.findMany({ where: { invoiceId: { in: invoiceIds } } });
    for (const r of rows) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
    await prisma.auditEvent.deleteMany({
      where: {
        entityType: "AppSetting",
        entityId: "documentTemplate",
        createdAt: { gte: new Date(Date.now() - 600_000) },
      },
    });
  });

  it("resolves override → instance setting → default, and saves with audit", async () => {
    await templates.resetTemplateConfig(actor);
    expect(await templates.resolveTemplateConfig(prisma, profileId)).toEqual(
      DEFAULT_TEMPLATE_CONFIG,
    );
    const saved = await templates.saveTemplateConfig(
      actor,
      mergeTemplateConfig({
        templateId: "classic",
        colors: { accent: "#123456", text: "#111111" },
      }),
    );
    expect(saved.templateId).toBe("classic");
    expect((await templates.resolveTemplateConfig(prisma, profileId)).templateId).toBe("classic");
    expect((await templates.getTemplateSettings(actor)).config.colors.accent).toBe("#123456");
    await templates.saveProfileTemplateOverride(
      actor,
      profileId,
      mergeTemplateConfig({ templateId: "compact" }),
    );
    expect((await templates.resolveTemplateConfig(prisma, profileId)).templateId).toBe("compact");
    expect((await templates.resolveTemplateConfig(prisma, null)).templateId).toBe("classic");
    await templates.saveProfileTemplateOverride(actor, profileId, null);
    expect((await templates.resolveTemplateConfig(prisma, profileId)).templateId).toBe("classic");
    expect(
      await prisma.auditEvent.count({
        where: {
          entityType: "AppSetting",
          entityId: "documentTemplate",
          action: "settings.updated",
        },
      }),
    ).toBeGreaterThan(0);
    await expect(templates.importTemplateConfig(actor, '{"templateId":"nope"}')).rejects.toThrow();
    const imported = await templates.importTemplateConfig(
      actor,
      JSON.stringify({ templateId: "ledger", pageNumbers: false }),
    );
    expect(imported.pageNumbers).toBe(false);
    expect(imported.templateId).toBe("ledger");
  });

  it("freezes the config at issue: changing the setting later leaves the stored PDF untouched", async () => {
    await templates.saveTemplateConfig(
      actor,
      mergeTemplateConfig({ templateId: "ledger", colors: { accent: "#5e6ad2", text: "#1a1a1a" } }),
    );
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
    expect(issued.templateSnapshot?.templateId).toBe("ledger");
    const first = await docs.ensureDocument("INVOICE", d.id);
    await templates.saveTemplateConfig(
      actor,
      mergeTemplateConfig({
        templateId: "classic",
        colors: { accent: "#ff0000", text: "#000000" },
      }),
    );
    const again = await docs.regenerateDocument(actor, "INVOICE", d.id);
    expect(again.version).toBe(2);
    expect(again.sha256).toBe(first.sha256); // rendered from the snapshot, not the new setting
  }, 90_000);
});
