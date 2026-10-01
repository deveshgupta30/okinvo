import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("PostgresRateLimiter", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let limiter: import("@/lib/rate-limit").RateLimiter;
  const key = `test:${Date.now()}`;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const { PostgresRateLimiter } = await import("@/lib/rate-limit/postgres");
    limiter = new PostgresRateLimiter(prisma);
  });

  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "test:" } } });
  });

  it("allows up to the limit in a window, then denies with the time left", async () => {
    const t0 = 1_700_000_000_000;
    expect(await limiter.hit(key, 2, 1000, t0)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0,
    });
    expect(await limiter.hit(key, 2, 1000, t0 + 100)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0,
    });
    expect(await limiter.hit(key, 2, 1000, t0 + 300)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 700,
    });
    // A denied hit never extends the window.
    expect(await limiter.hit(key, 2, 1000, t0 + 900)).toMatchObject({
      allowed: false,
      retryAfterMs: 100,
    });
  });

  it("opens a fresh window once the old one has expired", async () => {
    const t0 = 1_700_000_000_000;
    expect(await limiter.hit(key, 2, 1000, t0 + 1000)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0,
    });
  });

  it("keeps keys independent and survives concurrent hits without over-admitting", async () => {
    const t0 = 1_700_000_100_000;
    const other = `${key}:other`;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => limiter.hit(other, 4, 60_000, t0)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
    expect(await limiter.hit(key, 2, 1000, t0)).toMatchObject({ allowed: true });
  });
});
