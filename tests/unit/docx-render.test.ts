import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderDocx } from "@/lib/documents/docx/render";
import { sampleViewModel } from "@/lib/documents/sample";
import { mergeTemplateConfig, TEMPLATE_IDS } from "@/lib/schemas";

/**
 * DOCX output (spec §9d) from the same view-model as the PDF: a valid OOXML package whose
 * document.xml carries the number, every item, the totals and the words; page size follows the
 * paper; a header band shades its cells with the band colour; the items header row repeats.
 */
async function documentXml(docx: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("word/document.xml missing");
  return xml;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("renderDocx", () => {
  it.each(TEMPLATE_IDS)(
    "renders the sample with the %s template",
    async (templateId) => {
      const config = mergeTemplateConfig({ templateId });
      const vm = sampleViewModel(config);
      const docx = await renderDocx(vm, config);
      expect(docx.subarray(0, 2).toString()).toBe("PK");
      const xml = await documentXml(docx);
      expect(xml).toContain(vm.number!);
      for (const it of vm.items) expect(xml).toContain(xmlEscape(it.description));
      expect(xml).toContain(xmlEscape(vm.labels.total));
      const total = vm.totals.rows.find((r) => r.key === "total")!;
      expect(xml).toContain(xmlEscape(total.value));
      expect(xml).toContain(xmlEscape(vm.totals.amountInWords ?? ""));
      expect(xml).toContain("<w:tblHeader");
      expect(xml).toContain('<w:pgSz w:w="11906"');
    },
    30_000,
  );

  it("uses Letter page size and shades a header band with the band colour", async () => {
    const config = mergeTemplateConfig({
      templateId: "letterhead",
      paper: { size: "LETTER", margins: "narrow" },
      header: { style: "band", color: "#112233" },
    });
    const vm = sampleViewModel(config);
    const xml = await documentXml(await renderDocx(vm, config));
    expect(xml).toContain('<w:pgSz w:w="12240"');
    expect(xml).toMatch(/<w:shd [^>]*w:fill="112233"/);
    // light text on a dark band
    expect(xml).toMatch(/<w:color w:val="FFFFFF"/);
  }, 30_000);

  it("embeds the QR as a PNG part and numbers pages in the footer", async () => {
    const config = mergeTemplateConfig({});
    const vm = sampleViewModel(config);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const docx = await renderDocx(
      { ...vm, qrDataUrl: `data:image/png;base64,${png.toString("base64")}` },
      config,
    );
    const zip = await JSZip.loadAsync(docx);
    expect(Object.keys(zip.files).some((f) => /^word\/media\/.*\.png$/.test(f))).toBe(true);
    const footer = await zip.file("word/footer1.xml")?.async("string");
    expect(footer).toContain("PAGE");
    expect(footer).toContain("NUMPAGES");
    expect(footer).toContain(vm.number!);
  }, 30_000);
});
