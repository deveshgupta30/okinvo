import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { toFacturX } from "@/lib/einvoice/facturx/assemble";
import { toCii } from "@/lib/einvoice/cii/build";
import { ukInput } from "./einvoice-eu-input";

/**
 * Factur-X assembly (spec §9e): the PDF gains one embedded `factur-x.xml` with the Alternative
 * relationship listed in the catalog's /AF, a PDF/A-3b XMP packet with the Factur-X extension
 * schema, an sRGB output intent, MarkInfo and a trailer ID; the input bytes are untouched.
 */
async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage([595, 842]);
  doc.setTitle("Invoice INV-2026-0042");
  doc.setAuthor("Jo Bloggs Ltd");
  doc.setCreator("okinvo");
  doc.setProducer("okinvo");
  doc.setCreationDate(new Date("2026-05-01T00:00:00Z"));
  doc.setModificationDate(new Date("2026-05-01T00:00:00Z"));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

const META = {
  title: "Invoice INV-2026-0042",
  author: "Jo Bloggs Ltd",
  created: new Date("2026-05-01T00:00:00Z"),
  documentId: "0123456789abcdef0123456789abcdef",
};

describe("toFacturX", () => {
  it("embeds factur-x.xml as an Alternative associated file", async () => {
    const xml = toCii(ukInput());
    const out = await toFacturX(await samplePdf(), xml, META);
    expect(out.subarray(0, 8).toString()).toBe("%PDF-1.7");
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const af = doc.catalog.lookup(PDFName.of("AF"), PDFArray);
    expect(af.size()).toBe(1);
    const spec = af.lookup(0, PDFDict);
    expect(spec.get(PDFName.of("AFRelationship"))?.toString()).toBe("/Alternative");
    expect(spec.get(PDFName.of("F"))?.toString()).toBe("(factur-x.xml)");
    const ef = spec.lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"), PDFStream);
    expect(ef.dict.get(PDFName.of("Subtype"))?.toString()).toBe("/text#2Fxml");
    // the same file is reachable through the EmbeddedFiles name tree
    const names = doc.catalog.lookup(PDFName.of("Names"), PDFDict);
    const tree = names
      .lookup(PDFName.of("EmbeddedFiles"), PDFDict)
      .lookup(PDFName.of("Names"), PDFArray);
    expect(tree.size()).toBe(2);
    const raw = out.toString("latin1");
    expect(raw).toContain("factur-x.xml");
  });

  it("writes a PDF/A-3b XMP packet with the Factur-X extension schema and document info", async () => {
    const out = await toFacturX(await samplePdf(), toCii(ukInput()), META);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const meta = doc.catalog.lookup(PDFName.of("Metadata"), PDFStream);
    expect(meta.dict.get(PDFName.of("Subtype"))?.toString()).toBe("/XML");
    const xmp = Buffer.from(meta.getContents()).toString("utf8");
    expect(xmp).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(xmp).toContain("<pdfaid:conformance>B</pdfaid:conformance>");
    expect(xmp).toContain("<fx:DocumentType>INVOICE</fx:DocumentType>");
    expect(xmp).toContain("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>");
    expect(xmp).toContain("<fx:Version>1.0</fx:Version>");
    expect(xmp).toContain("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>");
    expect(xmp).toContain('<rdf:li xml:lang="x-default">Invoice INV-2026-0042</rdf:li>');
    expect(xmp).toContain("<rdf:li>Jo Bloggs Ltd</rdf:li>");
    expect(xmp).toContain("<xmp:CreateDate>2026-05-01T00:00:00Z</xmp:CreateDate>");
    expect(xmp).toContain("<pdf:Producer>okinvo</pdf:Producer>");
    expect(doc.getTitle()).toBe("Invoice INV-2026-0042");
    expect(doc.getCreationDate()?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("adds an sRGB output intent, MarkInfo and a trailer ID", async () => {
    const out = await toFacturX(await samplePdf(), toCii(ukInput()), META);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const intents = doc.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
    const intent = intents.lookup(0, PDFDict);
    expect(intent.get(PDFName.of("S"))?.toString()).toBe("/GTS_PDFA1");
    const profile = intent.lookup(PDFName.of("DestOutputProfile"), PDFStream);
    expect(profile.dict.get(PDFName.of("N"))?.toString()).toBe("3");
    expect(
      doc.catalog.lookup(PDFName.of("MarkInfo"), PDFDict).get(PDFName.of("Marked"))?.toString(),
    ).toBe("true");
    const raw = out.toString("latin1");
    expect(raw).toMatch(
      /\/ID\s*\[\s*<0123456789abcdef0123456789abcdef>\s*<0123456789abcdef0123456789abcdef>\s*\]/i,
    );
    expect(raw).toContain("/S /GTS_PDFA1");
  });

  it("marks a credit note as CREDITNOTE in the extension schema", async () => {
    const out = await toFacturX(await samplePdf(), toCii(ukInput()), {
      ...META,
      kind: "CREDIT_NOTE",
    });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const meta = doc.catalog.lookup(PDFName.of("Metadata"), PDFStream);
    expect(Buffer.from(meta.getContents()).toString("utf8")).toContain(
      "<fx:DocumentType>CREDITNOTE</fx:DocumentType>",
    );
  });
});
