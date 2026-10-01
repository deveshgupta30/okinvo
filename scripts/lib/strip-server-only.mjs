/**
 * Node resolve hook that turns `import "server-only"` into a no-op, so the DAL (which guards itself
 * with that package) can run from plain Node scripts such as the restore drill. Vitest does the
 * same through an alias (vitest.config.ts); Next itself provides the real package.
 *
 *   node --import tsx --import ./scripts/lib/strip-server-only.mjs scripts/<script>.ts
 */
import { register } from "node:module";

const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,", shortCircuit: true };
  }
  return next(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(hooks)}`);
