import type { z } from "zod";

/**
 * Returns a memoised validator: the first call parses `read()` against `schema`; later calls
 * return the same object. A failure is not cached, so a corrected environment loads next time.
 */
export function createEnvLoader<S extends z.ZodType>(
  schema: S,
  read: () => Record<string, unknown>,
): () => z.output<S> {
  let cached: z.output<S> | undefined;
  return () => {
    if (cached !== undefined) return cached;
    const result = schema.safeParse(read());
    if (!result.success) {
      const lines = result.error.issues.map(
        (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
      );
      throw new Error(`Invalid environment:\n${lines.join("\n")}`);
    }
    cached = result.data as z.output<S>;
    return cached;
  };
}
