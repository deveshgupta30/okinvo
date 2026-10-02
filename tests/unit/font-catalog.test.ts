import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_CATALOG, FONT_IDS, fontFamily } from "@/lib/documents/fonts/catalog";
import { FONT_FILES } from "@/lib/documents/fonts/registry.generated";
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
