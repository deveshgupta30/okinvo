import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Which catalogues exist on disk and which of them are machine-generated (`"@@generated": true`,
 * spec §8.2). Read once per process: the files ship with the build and never change at runtime.
 */
export interface CatalogueInfo {
  tag: string;
  generated: boolean;
}

let cached: Map<string, CatalogueInfo> | null = null;

function scan(): Map<string, CatalogueInfo> {
  const dir = path.join(process.cwd(), "messages");
  const out = new Map<string, CatalogueInfo>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const tag = file.slice(0, -5);
    try {
      const head = readFileSync(path.join(dir, file), "utf8").slice(0, 200);
      out.set(tag, { tag, generated: /"@@generated":\s*true/.test(head) });
    } catch {
      out.set(tag, { tag, generated: false });
    }
  }
  return out;
}

export function catalogueInfo(tag: string): CatalogueInfo | undefined {
  cached ??= scan();
  return cached.get(tag);
}

/** Tags whose catalogue is machine-generated; the language picker labels them. */
export function generatedLocales(): string[] {
  cached ??= scan();
  return [...cached.values()].filter((c) => c.generated).map((c) => c.tag);
}
