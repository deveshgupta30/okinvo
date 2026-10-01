import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { poolConfig } from "@/lib/db-config";

describe("pool timeouts", () => {
  it("gives up on an unreachable database within the connection budget, leaving no client checked out", async () => {
    const pool = new Pool({
      ...poolConfig("postgresql://okinvo:okinvo@10.255.255.1:5432/okinvo"),
      connectionTimeoutMillis: 500,
    });
    const started = Date.now();
    await expect(pool.query("SELECT 1")).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(pool.totalCount).toBe(0);
    await pool.end();
  }, 10_000);
});
