/** Result of one rate-limit check (v2 §14). `retryAfterMs` is 0 when allowed. */
export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/** A fixed-window counter per key; `now` is injectable for tests and defaults to `Date.now()`. */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number, now?: number): Promise<RateLimitDecision>;
}
