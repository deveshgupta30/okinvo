import "server-only";
import { serverSchema, type ServerEnv } from "./env.schema";

let cached: ServerEnv | undefined;

/**
 * Validates process.env once. Called eagerly from instrumentation.ts at server start so a bad
 * .env fails boot; called lazily by `env` so that `next build` (which imports route modules
 * under NODE_ENV=production while collecting page data) never trips production-only rules.
 */
export function validateEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  cached = result.data;
  return cached;
}

/** Typed, validated environment. Reads validate on first access, not on import. */
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get: (_, key) => Reflect.get(validateEnv(), key),
  has: (_, key) => Reflect.has(validateEnv(), key),
  ownKeys: () => Reflect.ownKeys(validateEnv()),
  getOwnPropertyDescriptor: (_, key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(validateEnv(), key);
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});
