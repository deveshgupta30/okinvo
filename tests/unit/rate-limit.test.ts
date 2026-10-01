import { describe, expect, it } from "vitest";
import {
  LIMITS,
  MemoryRateLimiter,
  clientIp,
  type RateLimitDecision,
  type RateLimiter,
} from "@/lib/rate-limit";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit within a window and counts down remaining", async () => {
    const limiter: RateLimiter = new MemoryRateLimiter();
    const t0 = 1_000_000;
    const first = await limiter.hit("k", 3, 1000, t0);
    expect(first).toEqual<RateLimitDecision>({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(await limiter.hit("k", 3, 1000, t0 + 10)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0,
    });
    expect(await limiter.hit("k", 3, 1000, t0 + 20)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0,
    });
  });
  it("denies the hit past the limit with the time until the window resets", async () => {
    const limiter = new MemoryRateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await limiter.hit("k", 3, 1000, t0);
    const denied = await limiter.hit("k", 3, 1000, t0 + 400);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBe(600);
    // Denied hits do not extend the window.
    expect(await limiter.hit("k", 3, 1000, t0 + 900)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 100,
    });
  });
  it("starts a fresh window once the previous one has elapsed", async () => {
    const limiter = new MemoryRateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await limiter.hit("k", 3, 1000, t0);
    expect((await limiter.hit("k", 3, 1000, t0 + 999)).allowed).toBe(false);
    expect(await limiter.hit("k", 3, 1000, t0 + 1000)).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
  });
  it("keeps keys independent", async () => {
    const limiter = new MemoryRateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await limiter.hit("a", 3, 1000, t0);
    expect((await limiter.hit("a", 3, 1000, t0)).allowed).toBe(false);
    expect(await limiter.hit("b", 3, 1000, t0)).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
  });
  it("prunes expired keys on hit", async () => {
    const limiter = new MemoryRateLimiter();
    const t0 = 1_000_000;
    await limiter.hit("a", 3, 1000, t0);
    await limiter.hit("b", 3, 1000, t0 + 500);
    expect(limiter.size).toBe(2);
    await limiter.hit("c", 3, 1000, t0 + 1200);
    expect(limiter.size).toBe(2); // "a" expired at t0 + 1000; "b" lives until t0 + 1500
    await limiter.hit("c", 3, 1000, t0 + 2000);
    expect(limiter.size).toBe(1);
  });
  it("defaults 'now' to the wall clock", async () => {
    const limiter = new MemoryRateLimiter();
    expect((await limiter.hit("k", 1, 60_000)).allowed).toBe(true);
    expect((await limiter.hit("k", 1, 60_000)).allowed).toBe(false);
  });
  it("denies everything when the limit is zero", async () => {
    const limiter = new MemoryRateLimiter();
    const denied = await limiter.hit("k", 0, 1000, 5000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1000);
  });
});

describe("clientIp", () => {
  it("returns the first X-Forwarded-For hop only when the proxy is trusted", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.5 , 10.0.0.1" });
    expect(clientIp(headers, true)).toBe("203.0.113.5");
    expect(clientIp(headers, false)).toBe("unknown");
    expect(clientIp(headers, false, "127.0.0.1")).toBe("127.0.0.1");
  });
  it("falls back when the header is absent or empty", () => {
    expect(clientIp(new Headers(), true)).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "" }), true)).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": " , 10.0.0.1" }), true, "fb")).toBe("fb");
  });
  it("accepts X-Real-IP as a second choice, again only when the proxy is trusted", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.7" });
    expect(clientIp(headers, true)).toBe("198.51.100.7");
    expect(clientIp(headers, false)).toBe("unknown");
    const both = new Headers({ "x-forwarded-for": "203.0.113.5", "x-real-ip": "198.51.100.7" });
    expect(clientIp(both, true)).toBe("203.0.113.5");
  });
});

describe("LIMITS", () => {
  it("matches v2 §14", () => {
    expect(LIMITS).toEqual({
      auth: { limit: 20, windowMs: 60_000 },
      verify: { limit: 30, windowMs: 60_000 },
      uploads: { limit: 30, windowMs: 60_000 },
      exports: { limit: 10, windowMs: 60_000 },
      email: { limit: 30, windowMs: 3_600_000 },
    });
  });
});
