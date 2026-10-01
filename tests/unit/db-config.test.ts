import { describe, expect, it } from "vitest";
import { poolConfig } from "@/lib/db-config";

describe("poolConfig", () => {
  it("bounds connect, idle and statement time so a hung database cannot pin the pool", () => {
    const config = poolConfig("postgresql://u:p@h:5432/d");
    expect(config.connectionString).toBe("postgresql://u:p@h:5432/d");
    expect(config.connectionTimeoutMillis).toBe(5_000);
    expect(config.idleTimeoutMillis).toBe(30_000);
    expect(config.keepAlive).toBe(true);
    expect(config.statement_timeout).toBe(30_000);
  });
});
