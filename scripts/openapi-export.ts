/**
 * Writes openapi/okinvo.json — the committed, deterministic OpenAPI document the SDK is generated
 * from (`pnpm openapi:export`). The server URL is a placeholder; a running instance serves its
 * own document at /api/openapi.json with its real APP_URL.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildOpenApi } from "../src/lib/api/openapi";

const out = path.resolve(import.meta.dirname, "..", "openapi", "okinvo.json");
mkdirSync(path.dirname(out), { recursive: true });
const doc = buildOpenApi("https://okinvo.example");
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(
  `wrote ${path.relative(process.cwd(), out)} (${Object.keys(doc.paths ?? {}).length} paths)`,
);
