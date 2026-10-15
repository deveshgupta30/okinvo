import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { ProductInputSchema } from "@/lib/schemas/product-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";

/**
 * Products (spec §5.1): a catalogue of goods with unique SKUs; an invoice line made from a product
 * snapshots the SKU and keeps it after the product is archived.
 */
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
const tag = `prod-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

describe.skipIf(!url)("products", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let products: typeof import("@/server/dal/products");
  let errors: typeof import("@/server/dal/errors");
  let productId: string;
  let profileId: string;
  let clientId: string;
  let invoiceId: string;

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    products = await import("@/server/dal/products");
    errors = await import("@/server/dal/errors");
  });

  afterAll(async () => {
    if (invoiceId) await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: tag } } });
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } });
    if (profileId) await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  it("creates, lists, updates; refuses a duplicate SKU with a field error", async () => {
    const created = await products.createProduct(
      actor,
      ProductInputSchema.parse({
        sku: `${tag}-W1`,
        name: "Widget",
        unitPrice: "250",
        currency: "INR",
        hsnCode: "8471",
        defaultTaxRate: "18",
      }),
    );
    productId = created.id;
    expect(created).toMatchObject({ sku: `${tag}-W1`, unitType: "UNIT", unitPrice: "250.00" });
    expect((await products.listProducts(actor)).map((p) => p.id)).toContain(productId);
    await expect(
      products.createProduct(
        actor,
        ProductInputSchema.parse({
          sku: `${tag}-W1`,
          name: "Duplicate",
          unitPrice: "1",
          currency: "INR",
          defaultTaxRate: "0",
        }),
      ),
    ).rejects.toMatchObject({ fieldErrors: { sku: ["already in use"] } });
    const updated = await products.updateProduct(
      actor,
      productId,
      ProductInputSchema.parse({
        sku: `${tag}-W1`,
        name: "Widget v2",
        unitPrice: "300",
        currency: "INR",
        hsnCode: "8471",
        defaultTaxRate: "18",
      }),
    );
    expect(updated.name).toBe("Widget v2");
    const event = await prisma.auditEvent.findFirst({
      where: { entityType: "Product", entityId: productId, action: "product.updated" },
    });
    expect(event?.after).toMatchObject({ name: "Widget v2" });
  });

  it("an invoice line from a product snapshots the SKU and survives archiving", async () => {
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const invoices = await import("@/server/dal/invoices");
    const profile = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "INDIVIDUAL",
        label: `${tag} profile`,
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
        invoiceNumberFormat: `P${Date.now() % 1000}/{FY}/{SEQ:3}`,
        creditNoteNumberFormat: "PC/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: [],
        emailBcc: [],
      }),
    );
    profileId = profile.id;
    const client = await clients.createClient(
      actor,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
        billingAddress: address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        currency: "INR",
        paymentTermsDays: 30,
      }),
    );
    clientId = client.id;
    const draft = await invoices.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-05-01",
        dueDate: "2026-05-31",
        currency: "INR",
        taxRegime: "INDIA_GST",
        items: [
          {
            description: "Widget v2",
            sacHsnCode: "8471",
            unitType: "UNIT",
            quantity: "2",
            unitPrice: "300",
            taxRate: "18",
            productId,
            sku: `${tag}-W1`,
          },
        ],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      }),
    );
    invoiceId = draft.id;
    expect(draft.items[0]).toMatchObject({ productId, sku: `${tag}-W1` });
    await expect(products.deleteProduct(actor, productId)).rejects.toBeInstanceOf(
      errors.InvariantError,
    );
    await products.archiveProduct(actor, productId);
    const again = await invoices.getInvoice(actor, invoiceId);
    expect(again.items[0]?.sku).toBe(`${tag}-W1`);
    expect((await products.listProducts(actor)).map((p) => p.id)).not.toContain(productId);
  });
});
