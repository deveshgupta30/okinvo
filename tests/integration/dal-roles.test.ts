import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import type { Actor } from "@/server/actor";

/**
 * Defence in depth ahead of the v1.1 Viewer role: every state-changing DAL entry point refuses a
 * non-owner actor itself, whatever the caller checked. Reads stay open to any signed-in actor.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const viewer: Actor = {
  userId: "no-such-user",
  email: "v@example.com",
  name: "V",
  role: "VIEWER",
  timezone: "UTC",
};

describe.skipIf(!url)("DAL role checks", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let errors: typeof import("@/server/dal/errors");

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    errors = await import("@/server/dal/errors");
  });

  it("refuses writes from a viewer across the DAL and creates nothing", async () => {
    const before = await prisma.client.count({ where: { archivedAt: {} } });
    const clients = await import("@/server/dal/clients");
    const profiles = await import("@/server/dal/profiles");
    const invoices = await import("@/server/dal/invoices");
    const templates = await import("@/server/dal/templates");
    const smtp = await import("@/server/dal/smtp-settings");
    const attempts: Promise<unknown>[] = [
      clients.createClient(
        viewer,
        ClientInputSchema.parse({
          displayName: "Viewer client",
          billingAddress: { line1: "1 Street", city: "Town", countryCode: "IN" },
          countryCode: "IN",
          currency: "INR",
          paymentTermsDays: 30,
        }),
      ),
      profiles.createProfile(
        viewer,
        ProfileInputSchema.parse({
          type: "INDIVIDUAL",
          label: "Viewer profile",
          legalName: "Viewer Legal",
          email: "v@example.com",
          address: { line1: "1 Street", city: "Town", countryCode: "IN" },
          countryCode: "IN",
          baseCurrency: "INR",
          locale: "en-IN",
          fiscalYearStartMonth: 4,
          invoiceNumberFormat: "V/{FY}/{SEQ:3}",
          creditNoteNumberFormat: "VC/{FY}/{SEQ:3}",
          defaultTaxRegime: "NONE",
          emailCc: [],
          emailBcc: [],
        }),
      ),
      invoices.createDraft(
        viewer,
        InvoiceDraftInputSchema.parse({
          issuerProfileId: "p",
          clientId: "c",
          issueDate: "2026-05-01",
          dueDate: "2026-05-31",
          currency: "INR",
          taxRegime: "NONE",
          items: [
            { description: "x", unitType: "HOUR", quantity: "1", unitPrice: "1", taxRate: "0" },
          ],
          displayConfig: DEFAULT_DISPLAY_CONFIG,
        }),
      ),
      invoices.issueInvoice(viewer, "no-such-invoice"),
      invoices.voidInvoice(viewer, "no-such-invoice", "x"),
      templates.resetTemplateConfig(viewer),
      smtp.clearSmtpSettings(viewer),
    ];
    const results = await Promise.allSettled(attempts);
    for (const r of results) {
      expect(r.status).toBe("rejected");
      const e = (r as PromiseRejectedResult).reason as unknown;
      expect(e).toBeInstanceOf(errors.ForbiddenError);
      expect(errors.isDalError(e)).toBe(true);
    }
    expect(await prisma.client.count({ where: { archivedAt: {} } })).toBe(before);
  });

  it("lets a viewer read", async () => {
    const clients = await import("@/server/dal/clients");
    await expect(clients.listClients(viewer)).resolves.toBeInstanceOf(Array);
  });
});
