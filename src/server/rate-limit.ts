import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { lazyProxy } from "@/lib/lazy";
import {
  LIMITS,
  MemoryRateLimiter,
  PostgresRateLimiter,
  clientIp,
  type RateLimiter,
} from "@/lib/rate-limit";

export type Bucket = keyof typeof LIMITS;

const globalForLimiter = globalThis as unknown as { rateLimiter?: RateLimiter };

/** `RATE_LIMIT_STORE=memory` (one replica, the default) or `postgres` (shared across replicas). */
function createLimiter(): RateLimiter {
  globalForLimiter.rateLimiter ??=
    env.RATE_LIMIT_STORE === "postgres" ? new PostgresRateLimiter(prisma) : new MemoryRateLimiter();
  return globalForLimiter.rateLimiter;
}

export const rateLimiter: RateLimiter = lazyProxy(createLimiter);

/** Returns a 429 Response when the caller is over the bucket's limit, else null. */
export async function enforceRateLimit(
  headers: Headers,
  bucket: Bucket,
  subject?: string,
): Promise<Response | null> {
  const key = `${bucket}:${subject ?? clientIp(headers, env.TRUST_PROXY)}`;
  const { limit, windowMs } = LIMITS[bucket];
  const decision = await rateLimiter.hit(key, limit, windowMs);
  if (decision.allowed) return null;
  return Response.json(
    { error: "rate_limited", retryAfterMs: decision.retryAfterMs },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)) },
    },
  );
}
