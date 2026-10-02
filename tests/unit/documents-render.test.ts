import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/crypto";
import { renderPdf } from "@/lib/documents/render";
import { sampleViewModel } from "@/lib/documents/sample";
import { DEFAULT_TEMPLATE_CONFIG, TEMPLATE_IDS, mergeTemplateConfig } from "@/lib/schemas";

async function textOf(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const r = await parser.getText();
    return r.text;
  } finally {
    await parser.destroy();
  }
}

const noAssets = async () => null;

describe("renderPdf", () => {
  it.each(TEMPLATE_IDS)(
    "renders the %s template with totals, words and the rupee sign",
    async (templateId) => {
      const config = mergeTemplateConfig({ templateId });
      const vm = sampleViewModel(config);
      const pdf = await renderPdf(vm, config, { assets: noAssets });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      const text = await textOf(pdf);
      expect(text).toContain(vm.number ?? "");
      expect(text).toContain("Only");
      expect(text).toContain("₹");
      expect(text).toContain("TAX INVOICE");
    },
    60_000,
  );

  it("watermarks drafts and prints no number", async () => {
    const config = DEFAULT_TEMPLATE_CONFIG;
    const { verifyUrl: _omit, ...rest } = sampleViewModel(config);
    const vm = { ...rest, isDraft: true, number: null, watermark: "DRAFT — not a tax invoice" };
    const text = await textOf(await renderPdf(vm, config, { assets: noAssets }));
    expect(text).toContain("DRAFT");
    expect(text).not.toContain("INV/26-27/042");
  }, 60_000);

  it("is byte-stable for identical input", async () => {
    const config = DEFAULT_TEMPLATE_CONFIG;
    const vm = sampleViewModel(config);
    const a = await renderPdf(vm, config, { assets: noAssets });
    const b = await renderPdf(vm, config, { assets: noAssets });
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  }, 60_000);

  it("honours paper size and the serif pairing", async () => {
    const config = mergeTemplateConfig({
      paper: { size: "LETTER", margins: "narrow" },
      font: "source-serif-4+inter",
    });
    const pdf = await renderPdf(sampleViewModel(config), config, { assets: noAssets });
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    try {
      const info = await parser.getInfo();
      expect(info.total).toBeGreaterThanOrEqual(1);
    } finally {
      await parser.destroy();
    }
    expect(pdf.toString("latin1")).toMatch(/MediaBox \[0 0 612 792\]/);
  }, 60_000);

  it("inlines the letterhead header image as an image object on the page", async () => {
    const png = await sharp({
      create: {
        width: 600,
        height: 120,
        channels: 3, // opaque: an alpha channel would add a soft-mask image object
        background: { r: 20, g: 90, b: 160 },
      },
    })
      .png()
      .toBuffer();
    const assets = async (id: string) => (id === "letterhead-1" ? png : null);
    const count = (pdf: Buffer) =>
      (pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
    const plain = await renderPdf(
      sampleViewModel(mergeTemplateConfig({ templateId: "letterhead" })),
      mergeTemplateConfig({ templateId: "letterhead" }),
      { assets },
    );
    const config = mergeTemplateConfig({
      templateId: "letterhead",
      header: { style: "image", imageAssetId: "letterhead-1", imageOpacity: 0.5 },
    });
    const withImage = await renderPdf(sampleViewModel(config), config, { assets });
    expect(count(withImage)).toBe(count(plain) + 1);
    // a missing asset hides the image instead of failing the render
    const missing = mergeTemplateConfig({
      templateId: "letterhead",
      header: { style: "image", imageAssetId: "gone" },
    });
    const without = await renderPdf(sampleViewModel(missing), missing, { assets });
    expect(count(without)).toBe(count(plain));
  }, 60_000);

  it("embeds the chosen heading and body families from the catalogue", async () => {
    const config = mergeTemplateConfig({ font: { heading: "playfair-display", body: "lato" } });
    const pdf = await renderPdf(sampleViewModel(config), config, { assets: noAssets });
    const raw = pdf.toString("latin1");
    const baseFonts = [...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)].map((m) => m[1] ?? "");
    expect(baseFonts.some((n) => /PlayfairDisplay/i.test(n))).toBe(true);
    expect(baseFonts.some((n) => /Lato/i.test(n))).toBe(true);
  }, 60_000);
});
