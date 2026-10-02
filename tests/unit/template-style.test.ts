import { describe, expect, it } from "vitest";
import { templateStyle, textOnBand } from "@/lib/documents/templates/styles";
import { mergeTemplateConfig, TEMPLATE_IDS } from "@/lib/schemas";

/**
 * Derived template style (spec §5.4): six variants, a header band or image with readable text,
 * and the minimal / modern flags both renderers key off.
 */
describe("textOnBand", () => {
  it("puts light text on dark bands and dark text on light ones", () => {
    expect(textOnBand("#111111")).toBe("light");
    expect(textOnBand("#F2DE8A")).toBe("dark");
    expect(textOnBand("#5e6ad2")).toBe("light");
    expect(textOnBand("#87d9a8")).toBe("dark");
    expect(textOnBand("#ffffff")).toBe("dark");
  });
});

describe("templateStyle", () => {
  it("knows six templates", () => {
    expect([...TEMPLATE_IDS]).toEqual([
      "ledger",
      "classic",
      "compact",
      "minimal",
      "letterhead",
      "modern",
    ]);
  });

  it("letterhead shows a band by default; the other templates show no header unless asked", () => {
    expect(templateStyle(mergeTemplateConfig({ templateId: "letterhead" })).headerStyle).toBe(
      "band",
    );
    expect(templateStyle(mergeTemplateConfig({ templateId: "ledger" })).headerStyle).toBe("none");
    expect(
      templateStyle(mergeTemplateConfig({ templateId: "ledger", header: { style: "band" } }))
        .headerStyle,
    ).toBe("band");
    expect(
      templateStyle(mergeTemplateConfig({ templateId: "letterhead", header: { style: "image" } }))
        .headerStyle,
    ).toBe("image");
  });

  it("resolves the band text colour automatically from the band colour, or as told", () => {
    const auto = templateStyle(
      mergeTemplateConfig({ templateId: "letterhead", header: { color: "#111111" } }),
    );
    expect(auto.headerText).toBe("light");
    const forced = templateStyle(
      mergeTemplateConfig({
        templateId: "letterhead",
        header: { color: "#111111", text: "dark" },
      }),
    );
    expect(forced.headerText).toBe("dark");
    // an image header defaults to dark text (photos and letterheads are usually light)
    const image = templateStyle(
      mergeTemplateConfig({ templateId: "letterhead", header: { style: "image" } }),
    );
    expect(image.headerText).toBe("dark");
  });

  it("converts the header height and opacity for the renderers", () => {
    const s = templateStyle(
      mergeTemplateConfig({
        templateId: "letterhead",
        header: { style: "image", heightMm: 40, imageOpacity: 0.5 },
      }),
    );
    expect(s.headerHeight).toBeCloseTo((40 * 72) / 25.4, 3);
    expect(s.headerImageOpacity).toBe(0.5);
  });

  it("minimal drops rules and boxes; modern tints its blocks", () => {
    const minimal = templateStyle(mergeTemplateConfig({ templateId: "minimal" }));
    expect(minimal.minimal).toBe(true);
    expect(minimal.tableBorders).toBe(false);
    expect(minimal.boxedTotals).toBe(false);
    expect(minimal.accentRule).toBe(false);
    const modern = templateStyle(mergeTemplateConfig({ templateId: "modern" }));
    expect(modern.tinted).toBe(true);
    expect(modern.headerStyle).toBe("band");
    expect(templateStyle(mergeTemplateConfig({ templateId: "ledger" })).tinted).toBe(false);
  });
});
