import type { RateLimitDecision, RateLimiter } from "./types";

/** The slice of a Prisma client this store needs; kept minimal so the module stays pure. */
export interface SqlClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

interface Row {
  count: number;
  windowStart: Date;
}

/**
 * Fixed-window limiter on the `RateLimitBucket` table (`RATE_LIMIT_STORE=postgres`, v2 §14) for
 * installs with more than one app replica. One atomic upsert per hit: the row's window is reused
 * while it is open, or replaced by a fresh one when it has expired, so concurrent hits can never
 * admit more than `limit` requests. Same semantics as `MemoryRateLimiter`: a denied hit neither
 * counts toward nor extends the window. Expired rows are swept opportunistically.
 */
export class PostgresRateLimiter implements RateLimiter {
  readonly #db: SqlClient;
  #hits = 0;

  constructor(db: SqlClient) {
    this.#db = db;
  }

  async hit(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): Promise<RateLimitDecision> {
    const at = new Date(now);
    const rows = await this.#db.$queryRaw<Row[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
      VALUES (${key}, 1, ${at})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."windowStart" + (${windowMs}::int * interval '1 millisecond') <= ${at}
            THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimitBucket"."windowStart" + (${windowMs}::int * interval '1 millisecond') <= ${at}
            THEN ${at}
          ELSE "RateLimitBucket"."windowStart"
        END
      RETURNING "count", "windowStart"`;
    const row = rows[0];
    if (!row) throw new Error("rate limit upsert returned no row");
    if ((this.#hits = (this.#hits + 1) % 200) === 0) await this.#sweep(at, windowMs);
    const count = Number(row.count);
    if (count <= limit) {
      return { allowed: true, remaining: limit - count, retryAfterMs: 0 };
    }
    const resetAt = new Date(row.windowStart).getTime() + windowMs;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, resetAt - now) };
  }

  /** Drops rows whose window closed more than a day ago (the longest configured window is 1 h). */
  async #sweep(at: Date, windowMs: number): Promise<void> {
    const cutoff = new Date(at.getTime() - Math.max(windowMs, 86_400_000));
    await this.#db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "windowStart" < ${cutoff}`;
  }
}
