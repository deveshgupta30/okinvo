import { describe, expect, it } from "vitest";
import {
  cjkFamily,
  SCRIPT_FONTS,
  scriptOf,
  splitRuns,
  type Script,
} from "@/lib/documents/fonts/scripts";

/**
 * Script detection and run splitting for document text (spec §9c): every string a document
 * prints is cut into runs by script so each run can take the Noto face that has its glyphs,
 * while punctuation, digits and spaces stay with the run before them.
 */
describe("scriptOf", () => {
  it.each<[string, Script]>([
    ["A", "latin"],
    ["é", "latin"],
    ["Ω", "greek"],
    ["Ж", "cyrillic"],
    ["Ա", "armenian"],
    ["א", "hebrew"],
    ["ع", "arabic"],
    ["ܐ", "syriac"],
    ["च", "devanagari"],
    ["ব", "bengali"],
    ["ਪ", "gurmukhi"],
    ["ગ", "gujarati"],
    ["ଓ", "oriya"],
    ["த", "tamil"],
    ["తె", "telugu"],
    ["ಕ", "kannada"],
    ["മ", "malayalam"],
    ["ස", "sinhala"],
    ["ไ", "thai"],
    ["ລ", "lao"],
    ["မ", "myanmar"],
    ["ქ", "georgian"],
    ["አ", "ethiopic"],
    ["ខ", "khmer"],
    ["发", "han"],
    ["あ", "kana"],
    ["ア", "kana"],
    ["한", "hangul"],
  ])("%s is %s", (ch, script) => {
    expect(scriptOf(ch.codePointAt(0)!)).toBe(script);
  });
  it("treats digits, punctuation and spaces as common", () => {
    for (const ch of "7 .,:-()₹€") expect(scriptOf(ch.codePointAt(0)!)).toBe("common");
  });
});

describe("splitRuns", () => {
  it("cuts a mixed line into one run per script with the matching Noto face", () => {
    const runs = splitRuns("Invoice चालान 发票", "Inter", "zh-CN");
    expect(runs).toEqual([
      { text: "Invoice ", fontFamily: "Inter" },
      { text: "चालान ", fontFamily: "Noto Sans Devanagari" },
      { text: "发票", fontFamily: "Noto Sans SC" },
    ]);
  });
  it("keeps digits and punctuation with the run before them", () => {
    const runs = splitRuns("राशि 1,234.00 (INR)", "Inter", "en-US");
    expect(runs.map((r) => r.text)).toEqual(["राशि 1,234.00 (", "INR)"]);
    expect(runs[0]?.fontFamily).toBe("Noto Sans Devanagari");
    expect(runs[1]?.fontFamily).toBe("Inter");
  });
  it("starts with the base face when the line opens with common characters", () => {
    expect(splitRuns("12 عنصر", "Lato", "ar")).toEqual([
      { text: "12 ", fontFamily: "Lato" },
      { text: "عنصر", fontFamily: "Noto Sans Arabic" },
    ]);
  });
  it("keeps Arabic combining marks inside the Arabic run", () => {
    const runs = splitRuns("فاتورةٌ", "Inter", "ar");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.fontFamily).toBe("Noto Sans Arabic");
  });
  it("returns a single base run for plain Latin and an empty list for an empty string", () => {
    expect(splitRuns("Total due", "Inter", "en-US")).toEqual([
      { text: "Total due", fontFamily: "Inter" },
    ]);
    expect(splitRuns("", "Inter", "en-US")).toEqual([]);
  });
  it("picks the CJK family by document language", () => {
    expect(cjkFamily("zh-CN")).toBe("Noto Sans SC");
    expect(cjkFamily("zh-TW")).toBe("Noto Sans TC");
    expect(cjkFamily("zh-HK")).toBe("Noto Sans TC");
    expect(cjkFamily("ja")).toBe("Noto Sans JP");
    expect(cjkFamily("ja-KS")).toBe("Noto Sans JP");
    expect(cjkFamily("ko")).toBe("Noto Sans KR");
    expect(cjkFamily("en-US")).toBe("Noto Sans SC");
    expect(splitRuns("請求書", "Inter", "ja")[0]?.fontFamily).toBe("Noto Sans JP");
    expect(splitRuns("한국어 문서", "Inter", "ko")[0]?.fontFamily).toBe("Noto Sans KR");
  });
  it("maps every script to a Noto family", () => {
    for (const [script, family] of Object.entries(SCRIPT_FONTS)) {
      if (script === "latin" || script === "common") expect(family).toBeNull();
      else expect(family).toMatch(/^Noto Sans/);
    }
  });
});
