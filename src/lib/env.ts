import "server-only";
import { createEnvLoader } from "./env-loader";
import { serverSchema, type ServerEnv } from "./env.schema";
import { lazyProxy } from "./lazy";

/**
 * Validates process.env once. Called eagerly from instrumentation.ts at server start so a bad
 * .env stops the process; called lazily by `env` so that `next build` (which imports route
 * modules under NODE_ENV=production while collecting page data) never trips production rules.
 */
export const validateEnv: () => ServerEnv = createEnvLoader(serverSchema, () => process.env);

/** Typed, validated environment. Reads validate on first access, not on import. */
export const env: ServerEnv = lazyProxy(validateEnv);
