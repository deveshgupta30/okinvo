import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENTS, ACCENT_COOKIE, ACCENT_LABELS, DEFAULT_ACCENT, parseAccent } from "@/lib/accent";

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
});
