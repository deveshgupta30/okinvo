import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Launch checklist items 6, 7 and 9 (addendum §2): every route exports metadata, every public
 * route carries its own description (signed-in routes are noindex and inherit the root one),
 * the root layout declares the social preview, and the sitemap and robots files exist.
 */
const APP = path.resolve(import.meta.dirname, "..", "..", "src", "app");

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pages(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

const all = pages(APP);
const rel = (f: string) => path.relative(APP, f).replace(/\\/g, "/");

describe("route metadata", () => {
  it("finds the routes", () => {
    expect(all.length).toBeGreaterThan(40);
  });

  it("every page exports metadata or generateMetadata", () => {
    const missing = all.filter((f) => {
      const src = readFileSync(f, "utf8");
      return !/export (const metadata|async function generateMetadata|function generateMetadata)/.test(
        src,
      );
    });
    expect(missing.map(rel)).toEqual([]);
  });

  it("every public page declares a description", () => {
    const missing = all
      .filter((f) => !rel(f).startsWith("(app)/"))
      .filter((f) => !/description/.test(readFileSync(f, "utf8")));
    expect(missing.map(rel)).toEqual([]);
  });

  it("the root layout sets the description, the social preview and the metadata base", () => {
    const src = readFileSync(path.join(APP, "layout.tsx"), "utf8");
    expect(src).toMatch(/template: "%s · okinvo"/);
    expect(src).toMatch(/description:/);
    expect(src).toMatch(/openGraph:/);
    expect(src).toMatch(/twitter:/);
    expect(src).toMatch(/metadataBase:/);
  });

  it("ships a sitemap and robots file", () => {
    expect(existsSync(path.join(APP, "sitemap.ts"))).toBe(true);
    expect(existsSync(path.join(APP, "robots.ts"))).toBe(true);
  });
});
