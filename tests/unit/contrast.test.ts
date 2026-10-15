import { describe, expect, it } from "vitest";
import { ACCENTS, customAccentVars } from "@/lib/accent";
import { DESIGN_COLORS } from "@/lib/design-colors.generated";

/**
 * WCAG 2.1 contrast over the generated colour tokens (addendum §2 item 13), for both themes
 * and every accent: body text on every surface at 4.5:1, placeholder and tertiary text at
 * 3:1, the accent's own text on each accent, and the semantic colours used as text.
 */
type Theme = Record<string, string>;
const THEMES: [string, Theme][] = [
  ["dark", DESIGN_COLORS.dark as Theme],
  ["light", DESIGN_COLORS.light as Theme],
];

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const SURFACES = ["canvas", "surface-1", "surface-2", "surface-3", "surface-4"];

describe("contrast of the colour tokens", () => {
  it("computes the reference ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  describe.each(THEMES)("%s theme", (_name, t) => {
    it.each(SURFACES)("ink and ink-muted read on %s at 4.5:1", (surface) => {
      expect(contrast(t["ink"]!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["ink-muted"]!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(SURFACES)("ink-subtle reads on %s at 4.5:1", (surface) => {
      expect(contrast(t["ink-subtle"]!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(SURFACES)("ink-tertiary (placeholders) reads on %s at 3:1", (surface) => {
      expect(contrast(t["ink-tertiary"]!, t[surface]!)).toBeGreaterThanOrEqual(3);
    });
    it.each(ACCENTS)("on-primary reads on the %s accent at 4.5:1", (accent) => {
      const primary = t[`accent-${accent}-primary`]!;
      const on = t[`accent-${accent}-on-primary`]!;
      expect(primary, accent).toBeDefined();
      expect(contrast(on, primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(on, t[`accent-${accent}-primary-hover`]!)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(["semantic-success", "semantic-warning", "semantic-danger", "link"])(
      "%s as text reads on canvas and surface-1 at 4.5:1",
      (token) => {
        expect(contrast(t[token]!, t["canvas"]!)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t[token]!, t["surface-1"]!)).toBeGreaterThanOrEqual(4.5);
      },
    );
    it("the accent as a focus ring reads against the canvas at 3:1", () => {
      for (const accent of ACCENTS) {
        expect(contrast(t[`accent-${accent}-primary-focus`]!, t["canvas"]!)).toBeGreaterThanOrEqual(
          3,
        );
      }
    });
  });
});

/** Review finding 1: a custom colour gets the better of the two inks and a focus shade per theme. */
describe("custom accent derivation", () => {
  const samples = ["4f9ad6", "9a9a9a", "f5e6a3", "1b2a49", "ff00ff", "8b5cf6", "e5e5e5", "202020"];
  it("picks the on-primary ink with the higher contrast", () => {
    for (const hex of samples) {
      const vars = customAccentVars(`custom-${hex}`);
      const chosen = contrast(vars["--accent-custom-primary"], vars["--accent-custom-on-primary"]);
      const best = Math.max(contrast(`#${hex}`, "#17191e"), contrast(`#${hex}`, "#ffffff"));
      expect(chosen).toBeCloseTo(best, 5);
    }
  });
  it("derives a focus shade that reads at 3:1 against each theme's canvas", () => {
    for (const hex of samples) {
      const vars = customAccentVars(`custom-${hex}`);
      expect(contrast(vars["--accent-custom-primary-focus"], "#010102")).toBeGreaterThanOrEqual(3);
      expect(
        contrast(vars["--accent-custom-primary-focus-light"], "#ffffff"),
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
