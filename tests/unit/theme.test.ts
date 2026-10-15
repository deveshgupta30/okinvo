import { describe, expect, it } from "vitest";
import { THEME_COOKIE, THEME_INIT_SCRIPT, initialTheme, parseThemeMode } from "@/lib/theme";

describe("parseThemeMode", () => {
  it("accepts the three modes", () => {
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("system")).toBe("system");
  });
  it("treats anything else as system (garbage cookie never breaks rendering)", () => {
    for (const v of ["blue", "", "%22dark%22", "DARK", undefined, null]) {
      expect(parseThemeMode(v)).toBe("system");
    }
  });
});

describe("initialTheme", () => {
  it("renders light only when explicitly light; system starts dark and the script corrects it", () => {
    expect(initialTheme("light")).toBe("light");
    expect(initialTheme("dark")).toBe("dark");
    expect(initialTheme("system")).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("reads the cookie by name, sets data-theme, and cannot close the script tag", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_COOKIE.replace(".", "\\."));
    expect(THEME_INIT_SCRIPT).toContain('setAttribute("data-theme"');
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme: light");
    expect(THEME_INIT_SCRIPT).not.toContain("</script");
  });
  it("applies the accent cookie to data-accent and ignores unknown values", () => {
    expect(THEME_INIT_SCRIPT).toContain(
      "okinvo\\.accent=(mint|lavender|sky|peach|butter|rose|sage|lilac|custom-[0-9a-f]{6})",
    );
    expect(THEME_INIT_SCRIPT).toContain('setAttribute("data-accent"');
    // a custom hex maps to the "custom" attribute; its variables come from the server-rendered style
    expect(THEME_INIT_SCRIPT).toContain('"custom"');
  });
});
