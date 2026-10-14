import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_CATALOG, FONT_IDS, fontFamily } from "@/lib/documents/fonts/catalog";
import {
  CJK_FONT_FILES,
  FONT_FILES,
  SCRIPT_FONT_FILES,
} from "@/lib/documents/fonts/registry.generated";
import { CJK_FAMILIES, SCRIPT_FAMILIES } from "@/lib/documents/fonts/scripts";
import { mergeTemplateConfig } from "@/lib/schemas";

/**
 * The document font catalogue (spec §5.3): a fixed list of Google families vendored from
 * Fontsource into public/fonts, one registry entry per shipped face, and a heading/body pair on
 * the template config that still accepts the v1 single-string values.
 */
describe("font catalogue", () => {
  it("holds 100 unique families split into sans and serif", () => {
    expect(FONT_CATALOG).toHaveLength(100);
    expect(new Set(FONT_IDS).size).toBe(FONT_CATALOG.length);
    expect(FONT_CATALOG.filter((f) => f.category === "sans").length).toBeGreaterThanOrEqual(45);
    expect(FONT_CATALOG.filter((f) => f.category === "serif").length).toBeGreaterThanOrEqual(45);
    for (const f of FONT_CATALOG) {
      expect(f.id).toMatch(/^[a-z0-9-]+$/);
      expect(f.package).toBe(`@fontsource/${f.id}`);
      expect(["OFL-1.1", "Apache-2.0", "UFL-1.0"]).toContain(f.license);
    }
  });

  it("ships a regular face and a bold face for every family", () => {
    for (const f of FONT_CATALOG) {
      const weights: readonly number[] = f.weights;
      expect(weights, f.id).toContain(400);
      expect(weights.includes(600) || weights.includes(700), f.id).toBe(true);
    }
  });

  it("lists an existing vendored file for every registered face", () => {
    for (const id of FONT_IDS) {
      const faces = FONT_FILES[id];
      expect(faces.length, id).toBeGreaterThanOrEqual(2);
      for (const face of faces) {
        expect(face.file).toMatch(new RegExp(`^${id}/${id}-latin-\\d{3}-(normal|italic)\\.woff$`));
        expect(existsSync(path.join("public", "fonts", face.file)), face.file).toBe(true);
      }
      const weights = faces.filter((x) => x.style === "normal").map((x) => x.weight);
      expect(weights).toEqual(expect.arrayContaining(fontFamily(id).weights));
    }
  });

  it("keeps the v1 single-string font values by mapping them to a pair", () => {
    expect(mergeTemplateConfig({ font: "source-serif-4+inter" }).font).toEqual({
      heading: "source-serif-4",
      body: "inter",
    });
    expect(mergeTemplateConfig({ font: "ibm-plex-sans" }).font).toEqual({
      heading: "ibm-plex-sans",
      body: "ibm-plex-sans",
    });
    expect(mergeTemplateConfig({}).font).toEqual({ heading: "inter", body: "inter" });
    expect(
      mergeTemplateConfig({ font: { heading: "playfair-display", body: "lato" } }).font,
    ).toEqual({ heading: "playfair-display", body: "lato" });
    expect(() => mergeTemplateConfig({ font: { heading: "comic-sans", body: "lato" } })).toThrow();
  });
});

/** Script coverage (spec §9c): every Noto family a run can switch to is vendored and pinned. */
describe("script fonts", () => {
  it("ships 400 and 700 of a subset face for every script family", () => {
    for (const family of SCRIPT_FAMILIES) {
      if ((CJK_FAMILIES as readonly string[]).includes(family)) continue;
      const faces = SCRIPT_FONT_FILES[family];
      expect(faces, family).toBeDefined();
      expect(faces!.map((f) => f.weight)).toEqual(expect.arrayContaining([400, 700]));
      for (const face of faces!) {
        expect(face.file).toMatch(/^noto-sans[a-z-]*\/noto-sans[a-z-]*-\d{3}-normal\.woff$/);
        expect(existsSync(path.join("public", "fonts", face.file)), face.file).toBe(true);
      }
    }
  });

  it("ships the four CJK variable fonts at their pinned hashes", () => {
    for (const family of CJK_FAMILIES) {
      const f = CJK_FONT_FILES[family];
      expect(f, family).toBeDefined();
      const file = path.join("public", "fonts", f!.file);
      expect(existsSync(file), f!.file).toBe(true);
      const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
      expect(sha, family).toBe(f!.sha256);
    }
  });
});
