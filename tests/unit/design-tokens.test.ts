import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontMatter, toTokensCss } from "../../scripts/design-tokens";

const dark = `---
name: t
colors:
  canvas: "#010102"
  ink: "#f7f8f8"
typography:
  app-body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
rounded:
  md: 8px
spacing:
  md: 16px
---
## Overview
`;
const light = `---
name: t-light
colors:
  canvas: "#ffffff"
---
`;

describe("parseFrontMatter", () => {
  it("returns the YAML tokens", () => {
    const t = parseFrontMatter(dark);
    expect(t.colors.canvas).toBe("#010102");
    expect(t.rounded?.md).toBe("8px");
  });
  it("throws without front matter", () => {
    expect(() => parseFrontMatter("# no tokens")).toThrow(/front matter/);
  });
});

describe("toTokensCss", () => {
  const css = toTokensCss(parseFrontMatter(dark), parseFrontMatter(light));
  it("emits dark colours inside @theme and resets Tailwind's palette", () => {
    expect(css).toContain("@theme {");
    expect(css).toContain("  --color-*: initial;");
    expect(css).toContain("  --color-canvas: #010102;");
  });
  it("emits light overrides under [data-theme=light] only for declared keys", () => {
    const lightBlock = css.split('[data-theme="light"] {')[1] ?? "";
    expect(lightBlock).toContain("--color-canvas: #ffffff;");
    expect(lightBlock).not.toContain("--color-ink");
  });
  it("emits typography as --text-* with sub-values, radius and spacing", () => {
    expect(css).toContain("  --text-app-body: 14px;");
    expect(css).toContain("  --text-app-body--line-height: 1.5;");
    expect(css).toContain("  --text-app-body--font-weight: 400;");
    expect(css).toContain("  --text-app-body--letter-spacing: 0px;");
    expect(css).toContain("  --radius-md: 8px;");
    expect(css).toContain("  --spacing-md: 16px;");
  });
  it("rejects a light token that does not exist in dark (typo protection)", () => {
    const bad = parseFrontMatter(`---\nname: x\ncolors:\n  canvsa: "#ffffff"\n---\n`);
    expect(() => toTokensCss(parseFrontMatter(dark), bad)).toThrow(/colors\.canvsa/);
  });
  it("rejects non-hex colours", () => {
    const bad = parseFrontMatter(`---\nname: x\ncolors:\n  canvas: "white"\n---\n`);
    expect(() => toTokensCss(bad, parseFrontMatter(light))).toThrow(/canvas/);
  });
});

describe("repository files", () => {
  const root = resolve(__dirname, "../..");
  const d = parseFrontMatter(readFileSync(resolve(root, "DESIGN.md"), "utf8"));
  const l = parseFrontMatter(readFileSync(resolve(root, "DESIGN.light.md"), "utf8"));
  it("light file overrides every surface, ink, hairline and semantic token", () => {
    const required = Object.keys(d.colors).filter((k) =>
      /^(canvas|surface-|hairline|ink|semantic-|primary|link)/.test(k),
    );
    for (const k of required) expect(l.colors, k).toHaveProperty(k);
  });
  it("committed src/app/tokens.css is current", () => {
    const committed = readFileSync(resolve(root, "src/app/tokens.css"), "utf8");
    expect(committed).toBe(toTokensCss(d, l));
  });
});
