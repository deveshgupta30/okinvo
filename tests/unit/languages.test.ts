import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isRtl,
  isSupportedLocale,
  LANGUAGE_TAGS,
  LANGUAGES,
  languagesByRegion,
  REGIONS,
} from "@/lib/i18n/languages";

/** The 115-entry language table (spec §8.1): integrity, tags, RTL set and grouping. */
const EXPECTED_ORDER =
  "so af az id ms jv ceb bs br ca cs co cy da de et en-GB en-US es es-ES eo eu fil fo fr-CA fr-FR fy ff fur ga gl gn ha hr rw iu ik is it sw ht kmr lv lt hu mg mt nl nb nn uz pl pt-BR pt-PT ro sc sn sq szl sk sl fi sv vi tr nl-BE zza el be bg ky kk mk mn ru sr tt tg uk ka hy he ur ar ps fa ckb sd syr ti am zgh ne mr hi as bn pa gu or ta te kn ml si th lo my km ko zh-TW zh-CN zh-HK ja ja-KS".split(
    " ",
  );

describe("LANGUAGES", () => {
  it("has exactly the 115 entries in the owner's order", () => {
    expect(LANGUAGES).toHaveLength(115);
    expect(LANGUAGES.map((l) => l.tag)).toEqual(EXPECTED_ORDER);
    expect([...LANGUAGE_TAGS]).toEqual(EXPECTED_ORDER);
  });

  it("has unique, well-formed BCP-47 tags", () => {
    const tags = LANGUAGES.map((l) => l.tag);
    expect(new Set(tags).size).toBe(tags.length);
    for (const tag of tags) {
      // ICU may prefer an alias (kmr → ku); the tag only has to be structurally valid
      expect(Intl.getCanonicalLocales(tag), tag).toHaveLength(1);
      expect(tag).toMatch(/^[a-z]{2,3}(-[A-Z]{2})?$/);
    }
  });

  it("names every language in itself and in English, in a known region", () => {
    for (const l of LANGUAGES) {
      expect(l.name.trim().length, l.tag).toBeGreaterThan(0);
      expect(l.english.trim().length, l.tag).toBeGreaterThan(0);
      expect(REGIONS as readonly string[]).toContain(l.region);
    }
    expect(LANGUAGES.find((l) => l.tag === "de")?.name).toBe("Deutsch");
    expect(LANGUAGES.find((l) => l.tag === "hi")?.name).toBe("हिन्दी");
    expect(LANGUAGES.find((l) => l.tag === "eo")?.region).toBe("Constructed");
  });

  it("marks exactly the right-to-left scripts", () => {
    const rtl = LANGUAGES.filter((l) => l.rtl).map((l) => l.tag);
    expect(rtl).toEqual(["he", "ur", "ar", "ps", "fa", "ckb", "sd", "syr"]);
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en-US")).toBe(false);
  });

  it("groups by region in table order and knows the default", () => {
    const groups = languagesByRegion();
    expect(groups.map((g) => g.region)).toEqual(
      REGIONS.filter((r) => LANGUAGES.some((l) => l.region === r)),
    );
    expect(groups.flatMap((g) => g.languages)).toHaveLength(115);
    expect(groups.find((g) => g.region === "Europe")?.languages.map((l) => l.tag)).toContain("de");
    expect(DEFAULT_LOCALE).toBe("en-US");
    expect(isSupportedLocale("en-US")).toBe(true);
    expect(isSupportedLocale("xx")).toBe(false);
  });
});
