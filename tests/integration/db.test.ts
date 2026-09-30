import "dotenv/config";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;

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
