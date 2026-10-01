/**
 * Rate limiting (v2 §14): a fixed window per client key. This module is pure and deliberately
 * does not import `server-only`. The Postgres store (`RateLimitBucket`) and the
 * `RATE_LIMIT_STORE` / `TRUST_PROXY` env wiring arrive with the hardening task; until then callers
 * construct `MemoryRateLimiter` directly.
 */
export type { RateLimitDecision, RateLimiter } from "./types";
export { MemoryRateLimiter } from "./memory";
export { PostgresRateLimiter, type SqlClient } from "./postgres";
// `clientIp` lives in its own file so `src/server/actor.ts` can import it without the limiter.
export { clientIp } from "./memory-ip";

export const LIMITS = {
  auth: { limit: 20, windowMs: 60_000 },
  verify: { limit: 30, windowMs: 60_000 },
  uploads: { limit: 30, windowMs: 60_000 },
  exports: { limit: 10, windowMs: 60_000 },
  email: { limit: 30, windowMs: 3_600_000 },
} as const;
