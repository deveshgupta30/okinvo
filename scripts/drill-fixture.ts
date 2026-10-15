/**
 * Restore-drill fixture (scripts/restore-drill.sh): puts one issued invoice with a stored PDF into
 * the database and prints what the verify step must find again after a backup → wipe → restore.
 * Uses the DAL like the integration tests do, with a synthetic owner actor.
 */
import "dotenv/config";

process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL ??= "http://127.0.0.1:3000";
process.env.AUTH_SECRET ??= "drill-only-secret-value-that-is-long-enough-0123456789";

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { DEFAULT_DISPLAY_CONFIG } = await import("../src/lib/schemas");
  const { ProfileInputSchema } = await import("../src/lib/schemas/profile-input");
  const { ClientInputSchema } = await import("../src/lib/schemas/client-input");
  const { InvoiceDraftInputSchema } = await import("../src/lib/schemas/invoice-input");
  const profiles = await import("../src/server/dal/profiles");
  const clients = await import("../src/server/dal/clients");
  const invoices = await import("../src/server/dal/invoices");
  const documents = await import("../src/server/dal/documents");

  const actor = {
    userId: "drill",
    email: "drill@example.com",
    name: "Drill",
    role: "OWNER" as const,
    timezone: "UTC",
    locale: "en-US",
  };
  const address = {
    line1: "1 Drill Street",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    countryCode: "IN",
  };
  const profile = await profiles.createProfile(
    actor,
    ProfileInputSchema.parse({
      type: "INDIVIDUAL",
      label: "Drill issuer",
      legalName: "Drill Legal",
      email: "drill@example.com",
      address,
      countryCode: "IN",
      stateCode: "KA",
      gstStateCode: "29",
      gstin: "29ABCDE1234F1Z5",
      baseCurrency: "INR",
      locale: "en-IN",
      fiscalYearStartMonth: 4,
      invoiceNumberFormat: "DRL/{FY}/{SEQ:3}",
      creditNoteNumberFormat: "DCN/{FY}/{SEQ:3}",
      defaultTaxRegime: "INDIA_GST",
      emailCc: [],
      emailBcc: [],
    }),
  );
  const client = await clients.createClient(
    actor,
    ClientInputSchema.parse({
      displayName: "Drill client",
      billingAddress: address,
      countryCode: "IN",
      stateCode: "KA",
      gstStateCode: "29",
      currency: "INR",
      paymentTermsDays: 15,
    }),
  );
  const draft = await invoices.createDraft(
    actor,
    InvoiceDraftInputSchema.parse({
      issuerProfileId: profile.id,
      clientId: client.id,
      issueDate: "2026-05-01",
      dueDate: "2027-03-31",
      currency: "INR",
      taxRegime: "INDIA_GST",
      items: [
        {
          description: "Restore drill",
          sacHsnCode: "998314",
          unitType: "HOUR",
          quantity: "2",
          unitPrice: "1000",
          taxRate: "18",
        },
      ],
      displayConfig: DEFAULT_DISPLAY_CONFIG,
    }),
  );
  const issued = await invoices.issueInvoice(actor, draft.id);
  const doc = await documents.ensureDocument("INVOICE", issued.id);

  const counts = {
    issuerProfiles: await prisma.issuerProfile.count({ where: { archivedAt: {} } }),
    clients: await prisma.client.count({ where: { archivedAt: {} } }),
    serviceItems: await prisma.serviceItem.count({ where: { archivedAt: {} } }),
    invoices: await prisma.invoice.count(),
    invoiceItems: await prisma.invoiceItem.count(),
    documents: await prisma.document.count(),
    auditEvents: await prisma.auditEvent.count(),
  };
  process.stdout.write(
    `${JSON.stringify({
      invoiceId: issued.id,
      number: issued.number,
      documentId: doc.id,
      storageKey: doc.storageKey,
      sha256: doc.sha256,
      counts,
    })}\n`,
  );
  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
