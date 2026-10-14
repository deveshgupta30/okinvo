import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assetRefs, loadDocs, parseFrontMatter } from "../../scripts/wiki-sync";

/**
 * The documentation tree (spec §9) is the source of truth for the docs site: every page carries
 * the front matter the sync needs, every page the plan names exists, every screenshot a page
 * references is committed, and the whole tree loads as one consistent set of wiki paths.
 */
const ROOT = path.resolve(import.meta.dirname, "..", "..", "docs", "wiki");

const PAGES = [
  "index",
  "getting-started",
  "onboarding",
  "profiles",
  "clients",
  "catalogue",
  "invoices",
  "credit-notes",
  "payments",
  "templates-and-fonts",
  "sharing-and-protected-pdfs",
  "exports-and-backups",
  "settings",
  "roles-and-members",
  "api-and-sdk",
  "mcp-and-skills",
  "e-invoicing",
  "localisation",
  "security",
  "operations-compose",
  "operations-kubernetes",
  "faq",
];

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "assets") out.push(...markdownFiles(full));
    } else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

describe("docs/wiki", () => {
  it("has every page the plan names", () => {
    for (const page of PAGES) expect(existsSync(path.join(ROOT, `${page}.md`)), page).toBe(true);
  });

  it("gives every page a title and a path in its front matter", () => {
    for (const file of markdownFiles(ROOT)) {
      const fm = parseFrontMatter(readFileSync(file, "utf8"));
      expect(fm.title, file).not.toBe("");
      expect(fm.path, file).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/);
      expect(fm.description, file).not.toBe("");
    }
  });

  it("loads as one tree with unique wiki paths and the home page first", () => {
    const docs = loadDocs(ROOT);
    expect(docs.length).toBeGreaterThanOrEqual(PAGES.length);
    const home = docs.find((d) => d.path === "home");
    expect(home?.file).toBe("index.md");
    expect(Math.min(...docs.map((d) => d.order))).toBe(home?.order);
  });

  it("references only screenshots that exist, and every screenshot is referenced", () => {
    const referenced = new Set<string>();
    for (const file of markdownFiles(ROOT)) {
      for (const asset of assetRefs(readFileSync(file, "utf8"))) {
        expect(existsSync(path.join(ROOT, "assets", asset)), `${file} -> ${asset}`).toBe(true);
        referenced.add(asset);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    const present = readdirSync(path.join(ROOT, "assets")).filter((f) => f.endsWith(".png"));
    expect(present.filter((f) => !referenced.has(f))).toEqual([]);
  });

  it("links only to pages that exist", () => {
    const paths = new Set(loadDocs(ROOT).map((d) => d.path));
    for (const file of markdownFiles(ROOT)) {
      const body = readFileSync(file, "utf8");
      for (const m of body.matchAll(/\[[^\]]*\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
        const target = m[1]!.replace(/^\.\//, "").replace(/\.md$/, "");
        const page = target === "index" ? "home" : target;
        expect(paths.has(page), `${file} -> ${m[1]}`).toBe(true);
      }
    }
  });
});
