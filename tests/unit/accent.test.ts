import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  ACCENT_COOKIE,
  ACCENT_LABELS,
  DEFAULT_ACCENT,
  accentAttribute,
  accentHex,
  customAccent,
  customAccentVars,
  parseAccent,
} from "@/lib/accent";

describe("accents", () => {
  it("offers the eight pastel accents with Mint as the default", () => {
    expect(ACCENTS).toEqual([
      "mint",
      "lavender",
      "sky",
      "peach",
      "butter",
      "rose",
      "sage",
      "lilac",
    ]);
    expect(DEFAULT_ACCENT).toBe("mint");
    expect(ACCENT_COOKIE).toBe("okinvo.accent");
    for (const id of ACCENTS) expect(ACCENT_LABELS[id]).toMatch(/^[A-Z][a-z]+$/);
  });

  it("parses the cookie defensively", () => {
    expect(parseAccent("rose")).toBe("rose");
    for (const v of ["", "blue", "MINT", undefined, null, 42]) expect(parseAccent(v)).toBe("mint");
  });

  it("has a generated token block for every accent in both themes", () => {
    const css = readFileSync(resolve(__dirname, "../../src/app/tokens.css"), "utf8");
    for (const id of ACCENTS) {
      expect(css).toContain(`:root[data-accent="${id}"] {`);
      expect(css).toContain(`:root[data-accent="${id}"][data-theme="light"] {`);
    }
    // pastels carry dark text in every accent and theme
    const onPrimary = css.match(/--color-on-primary: (#[0-9a-f]{6});/g) ?? [];
    expect(onPrimary.length).toBeGreaterThanOrEqual(2 + ACCENTS.length * 2);
    expect(new Set(onPrimary.map((m) => m.split(": ")[1]))).toEqual(new Set(["#17191e;"]));
  });

  it("accepts a custom hex accent and rejects anything that is not six hex digits", () => {
    expect(customAccent("#AA3366")).toBe("custom-aa3366");
    expect(customAccent("aa3366")).toBe("custom-aa3366");
    expect(parseAccent("custom-aa3366")).toBe("custom-aa3366");
    expect(accentAttribute("custom-aa3366")).toBe("custom");
    expect(accentAttribute("rose")).toBe("rose");
    expect(accentHex("custom-aa3366")).toBe("#aa3366");
    expect(accentHex("rose")).toBeNull();
    for (const v of [
      "custom-",
      "custom-aa336",
      "custom-aa33667",
      "custom-AA3366",
      "custom-zz3366",
      "#aa3366",
    ])
      expect(parseAccent(v)).toBe("mint");
    for (const v of ["#ab", "red", "", "#aa336g"]) expect(customAccent(v)).toBeNull();
  });

  it("derives the four primary tokens from a custom hex with readable text on it", () => {
    const light = customAccentVars("custom-f5d0a9");
    expect(light["--accent-custom-primary"]).toBe("#f5d0a9");
    expect(light["--accent-custom-on-primary"]).toBe("#17191e");
    expect(light["--accent-custom-primary-focus"]).toBe("#f5d0a9");
    expect(light["--accent-custom-primary-hover"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(light["--accent-custom-primary-hover"]).not.toBe("#f5d0a9");
    const dark = customAccentVars("custom-1f2a6b");
    expect(dark["--accent-custom-on-primary"]).toBe("#ffffff");
  });
});
