import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import { PrismaClient } from "@/generated/prisma/client";
import { withArchiveFilter } from "@/lib/db-archive";
import { poolConfig } from "@/lib/db-config";
import { env } from "@/lib/env";
import { lazyProxy } from "@/lib/lazy";

function createClient() {
  const adapter = new PrismaPg(poolConfig(env.DATABASE_URL));
  const base = new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Archive filter (v2 §10): list-style reads on archivable models hide archived rows.
  return base.$extends({
    name: "archiveFilter",
    query: {
      $allModels: {
        findMany({ model, args, query }) {
          return query(withArchiveFilter(model, args));
        },
        findFirst({ model, args, query }) {
          return query(withArchiveFilter(model, args));
        },
        count({ model, args, query }) {
          return query(withArchiveFilter(model, args));
        },
      },
    },
  });
}

export type Db = ReturnType<typeof createClient>;
/** What a DAL function receives inside `prisma.$transaction(async (tx) => …)`, or the client itself. */
export type Tx = Omit<Db, ITXClientDenyList>;

const globalForPrisma = globalThis as unknown as { prisma?: Db };

/** One client per process; cached on globalThis so Next's dev HMR doesn't leak pools. */
function client(): Db {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/**
 * Lazy handle: the client (and therefore env) is created on first use, not on import, so
 * `next build` can load route modules without a database or a production .env.
 */
export const prisma: Db = lazyProxy(client);
