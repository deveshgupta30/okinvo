import type { PoolConfig } from "pg";

/**
 * pg has no timeouts by default: a hung database would hold connect attempts and checked-out
 * clients until the kernel gives up, exhausting the pool while every readiness probe fails fast.
 */
export function poolConfig(connectionString: string): PoolConfig {
  return {
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    statement_timeout: 30_000,
  };
}
