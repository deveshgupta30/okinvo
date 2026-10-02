import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

/**
 * The invoice builder is a client component: everything in its context is serialised to the
 * browser. Issuer profiles carry decrypted secrets (US tax id) and settings the builder never
 * needs, so the context must carry a projection, not the full ProfileDto.
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
const tag = `bc-${Date.now()}`;

describe.skipIf(!url)("builder context", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let profiles: typeof import("@/server/dal/profiles");
  let builder: typeof import("@/server/dal/invoice-builder");
  let profileId: string;

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    profiles = await import("@/server/dal/profiles");
    builder = await import("@/server/dal/invoice-builder");
    const created = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "COMPANY",
        label: `${tag} US`,
        legalName: `${tag} US Legal`,
        email: "us@example.com",
        address: {
          line1: "1 Main Street",
          city: "Austin",
          state: "Texas",
          postalCode: "73301",
          countryCode: "US",
        },
        countryCode: "US",
        stateCode: "TX",
        usTaxId: "81-4443332",
        baseCurrency: "USD",
        locale: "en-US",
        fiscalYearStartMonth: 1,
        invoiceNumberFormat: "US/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "USC/{FY}/{SEQ:3}",
        defaultTaxRegime: "US_SALES_TAX",
        emailCc: [],
        emailBcc: [],
      }),
    );
    profileId = created.id;
  });

  afterAll(async () => {
    await prisma.issuerProfile.delete({ where: { id: profileId } }).catch(() => undefined);
  });

  it("never serialises the decrypted tax id or settings-only fields", async () => {
    const ctx = await builder.builderContext(actor, { issuerProfileId: profileId });
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("81-4443332");
    expect(json).not.toContain("4443332");
    expect(json).not.toContain("usTaxId");
    expect(json).not.toContain("emailInvoiceBody");
    const p = ctx.profiles.find((x) => x.id === profileId);
    expect(p).toMatchObject({
      baseCurrency: "USD",
      locale: "en-US",
      hasGstin: false,
      defaultTaxRegime: "US_SALES_TAX",
      archivedAt: null,
    });
  });
});
