import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProductInputSchema } from "@/lib/schemas/product-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { ServiceInputSchema } from "@/lib/schemas/service-input";
import type { Actor } from "@/server/actor";

/**
 * Catalogue items tagged to issuer profiles (spec §5.2): an item with no tags is offered to every
 * profile; a tagged item only to the profiles it names. The builder context carries the tags so
 * the picker can re-filter when the issuer changes.
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
const tag = `tags-${Date.now()}`;
const address = { line1: "1 Street", city: "Town", postalCode: "560001", countryCode: "IN" };

const profileInput = (label: string) =>
  ProfileInputSchema.parse({
    type: "INDIVIDUAL",
    label,
    legalName: `${label} Legal`,
    email: "me@example.com",
    address,
    countryCode: "IN",
    baseCurrency: "INR",
    locale: "en-IN",
    fiscalYearStartMonth: 4,
    invoiceNumberFormat: `T${Date.now() % 1000}/{FY}/{SEQ:3}`,
    creditNoteNumberFormat: "TC/{FY}/{SEQ:3}",
    defaultTaxRegime: "NONE",
    emailCc: [],
    emailBcc: [],
  });

describe.skipIf(!url)("catalogue tags", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let services: typeof import("@/server/dal/services");
  let products: typeof import("@/server/dal/products");
  let a: string;
  let b: string;

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    services = await import("@/server/dal/services");
    products = await import("@/server/dal/products");
    const profiles = await import("@/server/dal/profiles");
    a = (await profiles.createProfile(actor, profileInput(`${tag} A`))).id;
    b = (await profiles.createProfile(actor, profileInput(`${tag} B`))).id;
  });

  afterAll(async () => {
    await prisma.serviceItem.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: tag } } });
    await prisma.issuerProfile.deleteMany({ where: { label: { startsWith: tag } } });
  });

  it("stores tags on services and products and filters the lists per issuer", async () => {
    const forA = await services.createService(
      actor,
      ServiceInputSchema.parse({
        name: `${tag} only A`,
        unitType: "HOUR",
        defaultRate: "10",
        currency: "INR",
        defaultTaxRate: "0",
        issuerProfileIds: [a],
      }),
    );
    const everyone = await services.createService(
      actor,
      ServiceInputSchema.parse({
        name: `${tag} everyone`,
        unitType: "HOUR",
        defaultRate: "10",
        currency: "INR",
        defaultTaxRate: "0",
      }),
    );
    expect(forA.issuerProfileIds).toEqual([a]);
    expect(everyone.issuerProfileIds).toEqual([]);

    const listA = (await services.listServices(actor, { forIssuerProfileId: a })).map((s) => s.id);
    const listB = (await services.listServices(actor, { forIssuerProfileId: b })).map((s) => s.id);
    expect(listA).toEqual(expect.arrayContaining([forA.id, everyone.id]));
    expect(listB).toContain(everyone.id);
    expect(listB).not.toContain(forA.id);

    const prodB = await products.createProduct(
      actor,
      ProductInputSchema.parse({
        sku: `${tag}-B`,
        name: "B only",
        unitPrice: "1",
        currency: "INR",
        defaultTaxRate: "0",
        issuerProfileIds: [b],
      }),
    );
    expect(prodB.issuerProfileIds).toEqual([b]);
    const prodsA = (await products.listProducts(actor, { forIssuerProfileId: a })).map((p) => p.id);
    expect(prodsA).not.toContain(prodB.id);

    // re-tagging replaces the set
    const retagged = await services.updateService(
      actor,
      forA.id,
      ServiceInputSchema.parse({
        name: `${tag} only A`,
        unitType: "HOUR",
        defaultRate: "10",
        currency: "INR",
        defaultTaxRate: "0",
        issuerProfileIds: [b],
      }),
    );
    expect(retagged.issuerProfileIds).toEqual([b]);
  });

  it("a form posts one checkbox or many: both become an array", () => {
    expect(
      ServiceInputSchema.parse({
        name: "x",
        unitType: "HOUR",
        defaultRate: "1",
        currency: "INR",
        defaultTaxRate: "0",
        issuerProfileIds: "p1",
      }).issuerProfileIds,
    ).toEqual(["p1"]);
    expect(
      ServiceInputSchema.parse({
        name: "x",
        unitType: "HOUR",
        defaultRate: "1",
        currency: "INR",
        defaultTaxRate: "0",
      }).issuerProfileIds,
    ).toEqual([]);
  });
});
