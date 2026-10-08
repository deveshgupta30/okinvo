import { describe, expect, it } from "vitest";
import { mergeMessages } from "@/lib/i18n/messages";
import { matchLocale, parseAcceptLanguage, resolveLocale } from "@/lib/i18n/resolve";

/**
 * Locale resolution for a request (spec §8.1): the signed-in user's choice, then the
 * `okinvo.locale` cookie, then the best Accept-Language match, then en-US; and the message
 * fallback that keeps a partial catalogue usable.
 */
describe("parseAcceptLanguage", () => {
  it("orders tags by quality and ignores junk", () => {
    expect(parseAcceptLanguage("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5")).toEqual([
      "fr-CH",
      "fr",
      "en",
      "de",
    ]);
    expect(parseAcceptLanguage("de;q=0.4, hi;q=0.9")).toEqual(["hi", "de"]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("not a tag!!, ;q=1")).toEqual([]);
  });
});

describe("matchLocale", () => {
  it("prefers an exact tag, case-insensitively", () => {
    expect(matchLocale(["en-gb"])).toBe("en-GB");
    expect(matchLocale(["pt-BR"])).toBe("pt-BR");
  });
  it("falls back to the first table entry of the same language", () => {
    expect(matchLocale(["de-AT"])).toBe("de");
    expect(matchLocale(["fr"])).toBe("fr-CA");
    expect(matchLocale(["zh"])).toBe("zh-TW");
    expect(matchLocale(["en"])).toBe("en-US");
  });
  it("walks the candidates in order and gives up cleanly", () => {
    expect(matchLocale(["xx", "yy-ZZ", "hi"])).toBe("hi");
    expect(matchLocale(["xx"])).toBeUndefined();
    expect(matchLocale([])).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  it("takes the user's stored language first", () => {
    expect(resolveLocale({ user: "de", cookie: "fr-FR", acceptLanguage: "hi" })).toBe("de");
  });
  it("then the cookie, then Accept-Language, then en-US", () => {
    expect(resolveLocale({ user: null, cookie: "fr-FR", acceptLanguage: "hi" })).toBe("fr-FR");
    expect(resolveLocale({ user: undefined, cookie: undefined, acceptLanguage: "hi, en" })).toBe(
      "hi",
    );
    expect(resolveLocale({})).toBe("en-US");
  });
  it("ignores values outside the table at every step", () => {
    expect(resolveLocale({ user: "xx", cookie: "yy", acceptLanguage: "zz" })).toBe("en-US");
    expect(resolveLocale({ user: "xx", cookie: "ja" })).toBe("ja");
  });
});

describe("mergeMessages", () => {
  it("overlays a partial catalogue on the base and strips the generated marker", () => {
    const base = { common: { save: "Save", cancel: "Cancel" }, shell: { nav: { home: "Home" } } };
    const overlay = { "@@generated": true, common: { save: "Speichern" }, shell: {} };
    expect(mergeMessages(base, overlay)).toEqual({
      common: { save: "Speichern", cancel: "Cancel" },
      shell: { nav: { home: "Home" } },
    });
  });
  it("returns the base untouched when there is no overlay", () => {
    const base = { common: { save: "Save" } };
    expect(mergeMessages(base, undefined)).toEqual(base);
    expect(mergeMessages(base, undefined)).not.toBe(base);
  });
});
