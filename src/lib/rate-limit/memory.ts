import type { RateLimitDecision, RateLimiter } from "./types";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process fixed-window limiter (the `RATE_LIMIT_STORE=memory` default, v2 §14). The first hit
 * on a key opens a window of `windowMs`; hits past `limit` are denied until it ends, and a denied
 * hit never extends it. Expired keys are pruned on every hit so the map stays bounded by the
 * number of distinct clients seen within one window.
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly #buckets = new Map<string, Bucket>();

  /** Number of live (unexpired as of the last hit) keys. */
  get size(): number {
    return this.#buckets.size;
  }

  async hit(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): Promise<RateLimitDecision> {
    this.#prune(now);
    let bucket = this.#buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.#buckets.set(key, bucket);
    }
    if (bucket.count < limit) {
      bucket.count += 1;
      return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
    }
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }

  #prune(now: number): void {
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) this.#buckets.delete(key);
    }
  }
}
