import { beforeAll, describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/rate-limit";

const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });

/**
 * AUTH_RATE_LIMIT=false (the e2e suite only) lifts the per-IP limit on the auth endpoints; every
 * other bucket keeps limiting.
 */
describe("enforceRateLimit with AUTH_RATE_LIMIT=false", () => {
  let enforce: typeof import("@/server/rate-limit").enforceRateLimit;
  beforeAll(async () => {
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    process.env.DATABASE_URL ??= "postgresql://okinvo:okinvo@127.0.0.1:5432/okinvo";
    process.env.AUTH_SECRET ??= "x".repeat(48);
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.AUTH_RATE_LIMIT = "false";
    ({ enforceRateLimit: enforce } = await import("@/server/rate-limit"));
  });

  it("lets the auth bucket through past its limit while the other buckets still limit", async () => {
    for (let i = 0; i <= LIMITS.auth.limit + 5; i++)
      expect(await enforce(headers, "auth")).toBeNull();
    const other = (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).find((b) => b !== "auth")!;
    let last: Response | null = null;
    for (let i = 0; i <= LIMITS[other].limit; i++) last = await enforce(headers, other);
    expect(last?.status).toBe(429);
  });
});
