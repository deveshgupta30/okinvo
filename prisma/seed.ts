/**
 * Dev-only sample data: one issuer profile, two clients, three services, two payment methods.
 * Run with `pnpm db:seed` against the compose.dev database. Idempotent per label/name.
 * Uses the Prisma client directly (not the DAL) so it needs no request context.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { encryptField, keyFromBase64 } from "../src/lib/crypto";
import { DEFAULT_DISPLAY_CONFIG } from "../src/lib/schemas/display-config";

const url = process.env.DATABASE_URL;
const keyB64 = process.env.FIELD_ENCRYPTION_KEY;
if (!url || !keyB64) throw new Error("DATABASE_URL and FIELD_ENCRYPTION_KEY are required (.env)");
const key = keyFromBase64(keyB64);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const existing = await prisma.issuerProfile.findFirst({ where: { label: "Sample studio" } });
  const hasDefault = (await prisma.issuerProfile.count({ where: { isDefault: true } })) > 0;
  const profile =
    existing ??
    (await prisma.issuerProfile.create({
      data: {
        type: "INDIVIDUAL",
        isDefault: !hasDefault,
        label: "Sample studio",
        legalName: "Asha Rao",
        designation: "Product designer",
        email: "asha@example.com",
        phone: "+91 98765 43210",
        website: "asharao.design",
        address: {
          line1: "14 Lavelle Road",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          countryCode: "IN",
        },
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        panNumber: "ABCDE1234F",
        gstin: "29ABCDE1234F1Z5",
        lutNumber: "AD290426001234X",
        lutFiscalYear: "2026-27",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        defaultTaxRegime: "INDIA_GST",
        defaultTdsRate: "10",
        defaultDisplayConfig: JSON.parse(JSON.stringify(DEFAULT_DISPLAY_CONFIG)),
        defaultNotes: "Thank you for your business.",
        defaultTerms:
          "Payment within the agreed terms. Late payments attract 1.5% interest per month.",
      },
    }));

  const clients = [
    {
      displayName: "Northwind Technologies Pvt Ltd",
      contactPerson: "Priya Menon",
      email: "accounts@northwind.example",
      billingAddress: {
        line1: "Tower B, Cyber City",
        city: "Gurugram",
        state: "Haryana",
        postalCode: "122002",
        countryCode: "IN",
      },
      countryCode: "IN",
      stateCode: "HR",
      gstStateCode: "06",
      taxIdType: "GSTIN" as const,
      taxId: "06AAACN1234A1Z9",
      currency: "INR",
      paymentTermsDays: 15,
    },
    {
      displayName: "Contoso GmbH",
      contactPerson: "Jonas Weber",
      email: "ap@contoso.example",
      billingAddress: {
        line1: "Friedrichstraße 100",
        city: "Berlin",
        postalCode: "10117",
        countryCode: "DE",
      },
      countryCode: "DE",
      taxIdType: "VAT" as const,
      taxId: "DE123456789",
      currency: "EUR",
      paymentTermsDays: 30,
    },
  ];
  for (const c of clients) {
    const found = await prisma.client.findFirst({ where: { displayName: c.displayName } });
    if (!found) await prisma.client.create({ data: c });
  }

  const services = [
    {
      name: "Product discovery workshop",
      unitType: "DAY" as const,
      defaultRate: "45000.00",
      currency: "INR",
      sacHsnCode: "998314",
      defaultTaxRate: "18",
      description: "On-site, two facilitators",
    },
    {
      name: "UI design",
      unitType: "HOUR" as const,
      defaultRate: "2500.00",
      currency: "INR",
      sacHsnCode: "998314",
      defaultTaxRate: "18",
      description: null,
    },
    {
      name: "Usability test",
      unitType: "FIXED" as const,
      defaultRate: "35000.00",
      currency: "INR",
      sacHsnCode: "998314",
      defaultTaxRate: "18",
      description: "Recruiting and moderation of five sessions",
    },
  ];
  for (const s of services) {
    const found = await prisma.serviceItem.findFirst({ where: { name: s.name } });
    if (!found) await prisma.serviceItem.create({ data: s });
  }

  const methods = [
    {
      name: "HDFC current account",
      type: "BANK_TRANSFER" as const,
      currency: "INR",
      isDefault: (await prisma.paymentMethodProfile.count({ where: { isDefault: true } })) === 0,
      details: {
        type: "BANK_TRANSFER",
        accountHolder: "Asha Rao",
        accountNumber: "50100123456789",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
        branch: "Lavelle Road",
      },
      instructions: "Please quote the invoice number in the transfer reference.",
    },
    {
      name: "UPI",
      type: "UPI" as const,
      currency: "INR",
      isDefault: false,
      details: { type: "UPI", vpa: "asha@okhdfcbank", payeeName: "Asha Rao" },
      instructions: null,
    },
  ];
  for (const m of methods) {
    const found = await prisma.paymentMethodProfile.findFirst({ where: { name: m.name } });
    if (!found) {
      const { details, ...rest } = m;
      await prisma.paymentMethodProfile.create({
        data: { ...rest, detailsEnc: encryptField(JSON.stringify(details), key) },
      });
    }
  }
  console.log(
    `seeded: profile ${profile.label}, ${clients.length} clients, ${services.length} services, ${methods.length} payment methods`,
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
