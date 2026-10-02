import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/crypto";
import { renderPdf } from "@/lib/documents/render";
import { sampleRenderInput, sampleViewModel } from "@/lib/documents/sample";
import { buildDocumentViewModel, type DocumentViewModel } from "@/lib/documents/view-model";
import {
  DEFAULT_TEMPLATE_CONFIG,
  TEMPLATE_IDS,
  mergeTemplateConfig,
  type TemplateConfig,
} from "@/lib/schemas";

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

async function pagesOf(pdf: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const r = await parser.getText();
    return r.pages.map((p) => p.text);
  } finally {
    await parser.destroy();
  }
}

/** The sample invoice stretched to `n` lines (totals are not recomputed; layout is the point). */
function longViewModel(n: number, config: TemplateConfig): DocumentViewModel {
  const input = sampleRenderInput();
  const base = input.items;
  input.items = Array.from({ length: n }, (_, i) => ({
    ...base[i % base.length]!,
    position: i + 1,
    description: `${base[i % base.length]!.description} (line ${i + 1})`,
  }));
  return buildDocumentViewModel(input, {
    appUrl: "https://okinvo.example",
    assetUrl: (id) => `/api/assets/id/${id}`,
    config,
    draft: false,
  });
}

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

/**
 * Documents fit A4 and Letter (spec §4.6): the table header repeats on every page, the totals
 * block never splits, and every page ends with the reserved footer band.
 */
describe("pagination", () => {
  it.each(["A4", "LETTER"] as const)(
    "a 60-line invoice on %s runs to several pages with the header repeated and totals whole",
    async (size) => {
      const config = mergeTemplateConfig({ paper: { size, margins: "normal" } });
      const vm = longViewModel(60, config);
      const pdf = await renderPdf(vm, config, { assets: noAssets });
      const pages = await pagesOf(pdf);
      expect(pages.length).toBeGreaterThanOrEqual(2);
      for (const [i, text] of pages.entries()) {
        // the table header repeats wherever the table continues; trailing pages hold the sections
        if (/\(line \d+\)/.test(text)) {
          expect(text, `page ${i + 1} header`).toContain(vm.labels.description);
        }
        expect(text, `page ${i + 1} footer`).toContain(`Page ${i + 1} of ${pages.length}`);
      }
      // the totals block is never split: one page carries total, subtotal and the words together,
      // and it comes after the last item row
      const totalLabel = new RegExp(`\\b${vm.labels.total}\\b`);
      const totalPages = pages.map((t, i) => (totalLabel.test(t) ? i : -1)).filter((i) => i >= 0);
      expect(totalPages).toHaveLength(1);
      const totalsPage = pages[totalPages[0]!]!;
      expect(totalsPage).toContain(vm.labels.subtotal);
      expect(totalsPage).toContain(vm.totals.amountInWords ?? "");
      const lastRowPage = pages.findIndex((t) => t.includes("(line 60)"));
      expect(lastRowPage).toBeGreaterThanOrEqual(0);
      expect(totalPages[0]).toBeGreaterThanOrEqual(lastRowPage);
    },
    90_000,
  );

  it("keeps the first page's items table header on a three-page document too", async () => {
    const config = mergeTemplateConfig({ templateId: "compact" });
    const vm = longViewModel(140, config);
    const pages = await pagesOf(await renderPdf(vm, config, { assets: noAssets }));
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const text of pages) {
      if (/\(line \d+\)/.test(text)) expect(text).toContain(vm.labels.description);
    }
  }, 90_000);
});
