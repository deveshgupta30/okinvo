import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { ServiceInputSchema } from "@/lib/schemas/service-input";
import type { Actor } from "@/server/actor";

/**
 * Role matrix (spec §9b): the DAL is the boundary. EDITOR writes business records; only OWNER
 * touches settings; VIEWER reads. Every attempt below either succeeds (or fails for a reason
 * other than the role) or is refused with ForbiddenError, exactly as the table says.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const tag = `roles-${Date.now()}`;
const actor = (role: Actor["role"]): Actor => ({
  userId: "no-such-user",
  email: `${role.toLowerCase()}@example.com`,
  name: role,
  role,
  timezone: "UTC",
});

type Outcome = "ok" | "forbidden";
type Row = [name: string, run: (a: Actor) => Promise<unknown>, editor: Outcome, viewer: Outcome];

describe.skipIf(!url)("DAL role matrix", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let errors: typeof import("@/server/dal/errors");
  let rows: Row[];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    errors = await import("@/server/dal/errors");
    const clients = await import("@/server/dal/clients");
    const services = await import("@/server/dal/services");
    const invoices = await import("@/server/dal/invoices");
    const creditNotes = await import("@/server/dal/credit-notes");
    const payments = await import("@/server/dal/payments");
    const profiles = await import("@/server/dal/profiles");
    const templates = await import("@/server/dal/templates");
    const smtp = await import("@/server/dal/smtp-settings");
    const methods = await import("@/server/dal/payment-methods");
    rows = [
      [
        "createClient",
        (a) =>
          clients.createClient(
            a,
            ClientInputSchema.parse({
              displayName: `${tag} ${a.role}`,
              billingAddress: { line1: "1 Street", city: "Town", countryCode: "IN" },
              countryCode: "IN",
              currency: "INR",
              paymentTermsDays: 30,
            }),
          ),
        "ok",
        "forbidden",
      ],
      [
        "createService",
        (a) =>
          services.createService(
            a,
            ServiceInputSchema.parse({
              name: `${tag} ${a.role}`,
              unitType: "HOUR",
              defaultRate: "10.00",
              currency: "INR",
              defaultTaxRate: "0",
            }),
          ),
        "ok",
        "forbidden",
      ],
      ["issueInvoice", (a) => invoices.issueInvoice(a, "no-such-invoice"), "ok", "forbidden"],
      ["voidInvoice", (a) => invoices.voidInvoice(a, "no-such-invoice", "x"), "ok", "forbidden"],
      ["issueCreditNote", (a) => creditNotes.issueCreditNote(a, "no-such"), "ok", "forbidden"],
      ["deletePayment", (a) => payments.deletePayment(a, "no-such"), "ok", "forbidden"],
      [
        "createProfile (settings)",
        (a) =>
          profiles.createProfile(
            a,
            ProfileInputSchema.parse({
              type: "INDIVIDUAL",
              label: `${tag} ${a.role}`,
              legalName: "Legal",
              email: "x@example.com",
              address: { line1: "1 Street", city: "Town", countryCode: "IN" },
              countryCode: "IN",
              baseCurrency: "INR",
              locale: "en-IN",
              fiscalYearStartMonth: 4,
              invoiceNumberFormat: "R/{FY}/{SEQ:3}",
              creditNoteNumberFormat: "RC/{FY}/{SEQ:3}",
              defaultTaxRegime: "NONE",
              emailCc: [],
              emailBcc: [],
            }),
          ),
        "forbidden",
        "forbidden",
      ],
      [
        "resetTemplateConfig (settings)",
        (a) => templates.resetTemplateConfig(a),
        "forbidden",
        "forbidden",
      ],
      ["clearSmtpSettings (settings)", (a) => smtp.clearSmtpSettings(a), "forbidden", "forbidden"],
      [
        "setDefaultPaymentMethod (settings)",
        (a) => methods.setDefaultPaymentMethod(a, "no-such"),
        "forbidden",
        "forbidden",
      ],
    ];
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { displayName: { startsWith: tag } } });
    await prisma.serviceItem.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.issuerProfile.deleteMany({ where: { label: { startsWith: tag } } });
  });

  async function outcome(run: (a: Actor) => Promise<unknown>, a: Actor): Promise<Outcome> {
    try {
      await run(a);
      return "ok";
    } catch (e) {
      return e instanceof errors.ForbiddenError ? "forbidden" : "ok"; // another error means the role check passed
    }
  }

  it("OWNER may do everything", async () => {
    for (const [name, run] of rows) expect(await outcome(run, actor("OWNER")), name).toBe("ok");
  });

  it("EDITOR writes business records but not settings", async () => {
    for (const [name, run, editor] of rows) {
      expect(await outcome(run, actor("EDITOR")), name).toBe(editor);
    }
  });

  it("VIEWER writes nothing and still reads", async () => {
    for (const [name, run, , viewer] of rows) {
      expect(await outcome(run, actor("VIEWER")), name).toBe(viewer);
    }
    const clients = await import("@/server/dal/clients");
    await expect(clients.listClients(actor("VIEWER"))).resolves.toBeInstanceOf(Array);
  });

  it("records the actor's role on audit events", async () => {
    const clients = await import("@/server/dal/clients");
    const created = await clients.createClient(
      actor("EDITOR"),
      ClientInputSchema.parse({
        displayName: `${tag} audited`,
        billingAddress: { line1: "1 Street", city: "Town", countryCode: "IN" },
        countryCode: "IN",
        currency: "INR",
        paymentTermsDays: 30,
      }),
    );
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "Client", entityId: created.id },
    });
    expect(event.actorRole).toBe("EDITOR");
  });
});
