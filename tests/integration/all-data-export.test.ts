import "dotenv/config";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientInputSchema } from "@/lib/schemas/client-input";
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
const tag = `alldata-${Date.now()}`;

describe.skipIf(!url)("export all data", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let clientId: string;

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    const clients = await import("@/server/dal/clients");
    const c = await clients.createClient(
      actor,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
        billingAddress: { line1: "1 Test Street", city: "Bengaluru", countryCode: "IN" },
        countryCode: "IN",
        currency: "INR",
        paymentTermsDays: 30,
      }),
    );
    clientId = c.id;
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: clientId } });
  });

  it("bundles every dataset as CSV plus a relational data.json and a README", async () => {
    const { allDataEntries } = await import("@/server/exports/all-data");
    const { zipBuffer } = await import("@/lib/exports/zip");
    const buf = await zipBuffer(allDataEntries(actor));
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([
      "README.txt",
      "csv/clients.csv",
      "csv/credit-notes.csv",
      "csv/gst-summary.csv",
      "csv/invoice-items.csv",
      "csv/invoices.csv",
      "csv/payments.csv",
      "csv/products.csv",
      "csv/services.csv",
      "csv/tds-summary.csv",
      "data.json",
    ]);

    const clientsCsv = await zip.file("csv/clients.csv")?.async("string");
    expect(clientsCsv?.startsWith("﻿ID,Display name")).toBe(true);
    expect(clientsCsv).toContain(`${tag} client`);

    const raw = await zip.file("data.json")?.async("string");
    if (!raw) throw new Error("data.json missing");
    const data = JSON.parse(raw) as {
      schemaVersion: number;
      appVersion: string;
      exportedAt: string;
      excludedFields: string[];
      tables: Record<string, Record<string, unknown>[]>;
    };
    expect(data.schemaVersion).toBe(1);
    expect(typeof data.appVersion).toBe("string");
    expect(Number.isNaN(Date.parse(data.exportedAt))).toBe(false);
    expect(Object.keys(data.tables)).toEqual([
      "users",
      "issuerProfiles",
      "documentSequences",
      "clients",
      "serviceItems",
      "products",
      "paymentMethodProfiles",
      "assets",
      "invoices",
      "invoiceItems",
      "invoiceTaxLines",
      "invoicePaymentMethods",
      "payments",
      "paymentAttachments",
      "creditNotes",
      "creditNoteTaxLines",
      "documents",
      "emailMessages",
      "appSettings",
      "auditEvents",
    ]);
    const mine = data.tables.clients?.find((c) => c.id === clientId);
    expect(mine).toMatchObject({ displayName: `${tag} client`, currency: "INR" });
    // Secrets never leave the database: encrypted columns are dropped from every table row (and
    // only ever appear redacted inside audit payloads), and the SMTP setting is left out.
    const secretKeys = ["detailsEnc", "usTaxIdEnc", "passwordEnc"];
    for (const key of secretKeys) expect(data.excludedFields).toContain(key);
    const offenders: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (secretKeys.includes(k) && x !== "[redacted]") offenders.push(`${path}.${k}`);
          walk(x, `${path}.${k}`);
        }
      }
    };
    walk(data.tables, "tables");
    expect(offenders).toEqual([]);
    expect(data.tables.appSettings?.some((s) => s.key === "smtp")).toBe(false);

    const readme = await zip.file("README.txt")?.async("string");
    expect(readme).toContain("detailsEnc");
    expect(readme).toContain("schemaVersion");
  });
});
