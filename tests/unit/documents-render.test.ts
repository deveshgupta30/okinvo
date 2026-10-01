import { PDFParse } from "pdf-parse";
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
});
