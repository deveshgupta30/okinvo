import "dotenv/config";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
// Locally these tests skip without a database; in CI a missing DATABASE_URL is a broken pipeline, not a skip.
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("database", () => {
  const pool = new Pool({ connectionString: url });
  afterAll(() => pool.end());

  it("answers SELECT 1", async () => {
    const r = await pool.query<{ one: number }>("SELECT 1 AS one");
    expect(r.rows[0]?.one).toBe(1);
  });

  it("has the partial unique indexes the Prisma schema cannot express", async () => {
    const r = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('IssuerProfile_single_default', 'PaymentMethodProfile_single_default')
       ORDER BY indexname`,
    );
    expect(r.rows.map((x) => x.indexname)).toEqual([
      "IssuerProfile_single_default",
      "PaymentMethodProfile_single_default",
    ]);
    for (const row of r.rows) {
      expect(row.indexdef).toMatch(/WHERE.*"isDefault" = true.*"archivedAt" IS NULL/);
    }
  });

  it("keeps invoice numbers unique per issuer profile, not globally", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const id of ["issuer-a", "issuer-b"]) {
        await client.query(
          `INSERT INTO "IssuerProfile"
             (id, label, "legalName", email, address, "countryCode", "defaultDisplayConfig", "updatedAt")
           VALUES ($1, $1, $1, 't@example.com', '{}', 'IN', '{}', now())`,
          [id],
        );
      }
      await client.query(
        `INSERT INTO "Client" (id, "displayName", "billingAddress", "countryCode", currency, "updatedAt")
         VALUES ('client-a', 'Client', '{}', 'IN', 'INR', now())`,
      );
      const invoice = (id: string, issuer: string) =>
        client.query(
          `INSERT INTO "Invoice"
             (id, "issuerProfileId", "clientId", "issueDate", "dueDate", currency, "taxRegime",
              "displayConfig", "verificationToken", number, "updatedAt")
           VALUES ($1, $2, 'client-a', '2026-04-01', '2026-05-01', 'INR', 'INDIA_GST', '{}', $1,
                   'INV/26-27/001', now())`,
          [id, issuer],
        );
      await invoice("inv-1", "issuer-a");
      await invoice("inv-2", "issuer-b"); // same number, different issuer: allowed
      await expect(invoice("inv-3", "issuer-a")).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows exactly one non-archived default issuer profile", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insert = (id: string) =>
        client.query(
          `INSERT INTO "IssuerProfile"
             (id, label, "legalName", email, address, "countryCode", "defaultDisplayConfig", "isDefault", "updatedAt")
           VALUES ($1, 'Test', 'Test Legal', 't@example.com', '{}', 'IN', '{}', true, now())`,
          [id],
        );
      await insert("test-default-1");
      await expect(insert("test-default-2")).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
