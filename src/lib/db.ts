import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { poolConfig } from "@/lib/db-config";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg(poolConfig(env.DATABASE_URL));
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** One client per process; cached on globalThis so Next's dev HMR doesn't leak pools. */
function client(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/**
 * Lazy handle: the client (and therefore env) is created on first use, not on import, so
 * `next build` can load route modules without a database or a production .env.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_, key) => {
    const target = client();
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
