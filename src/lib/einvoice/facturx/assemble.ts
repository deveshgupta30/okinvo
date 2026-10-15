import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";

/**
 * Factur-X / ZUGFeRD assembly (spec §9e): the stored PDF becomes a PDF/A-3b file that carries
 * the EN 16931 CII XML as an embedded, Alternative-related `factur-x.xml`. The page content is
 * untouched; what is added is the embedded file and its catalog /AF entry, a PDF/A-3b XMP packet
 * with the Factur-X extension schema (matching the document info), an sRGB output intent,
 * MarkInfo and a trailer ID. Deterministic for the same input and metadata.
 */
export interface FacturXMeta {
  title: string;
  author: string;
  created: Date;
  /** 32 hex characters; becomes the trailer /ID and the XMP document ID. */
  documentId: string;
  kind?: "INVOICE" | "CREDIT_NOTE" | undefined;
}

export const FACTURX_FILENAME = "factur-x.xml";
export const FACTURX_CONFORMANCE = "EN 16931";

/** Compact sRGB v2 profile (saucecontrol/Compact-ICC-Profiles, CC0 1.0): 736 bytes, PDF/A-valid. */
const ICC_PATH = join(process.cwd(), "src", "lib", "einvoice", "icc", "sRGB-v2-magic.icc");
let iccCache: Uint8Array | null = null;
function iccProfile(): Uint8Array {
  iccCache ??= new Uint8Array(readFileSync(ICC_PATH));
  return iccCache;
}

const escapeXml = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function pdfDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export function facturXXmp(meta: FacturXMeta): string {
  const created = isoSeconds(meta.created);
  const docType = meta.kind === "CREDIT_NOTE" ? "CREDITNOTE" : "INVOICE";
  const xml = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${escapeXml(meta.author)}</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>okinvo</xmp:CreatorTool>
      <xmp:CreateDate>${created}</xmp:CreateDate>
      <xmp:ModifyDate>${created}</xmp:ModifyDate>
      <xmp:MetadataDate>${created}</xmp:MetadataDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>okinvo</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
      <xmpMM:DocumentID>uuid:${meta.documentId}</xmpMM:DocumentID>
      <xmpMM:InstanceID>uuid:${meta.documentId}</xmpMM:InstanceID>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>${docType}</fx:DocumentType>
      <fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${FACTURX_CONFORMANCE}</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
${" ".repeat(2048)}
<?xpacket end="w"?>`;
  return xml;
}

export async function toFacturX(pdf: Buffer, xml: string, meta: FacturXMeta): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const ctx = doc.context;
  const catalog = doc.catalog;
  const date = PDFString.of(pdfDate(meta.created));

  // the embedded invoice and its file specification
  const xmlBytes = new TextEncoder().encode(xml);
  const fileStream = ctx.flateStream(xmlBytes, {
    Type: "EmbeddedFile",
    Subtype: PDFName.of("text/xml"),
    Params: ctx.obj({ Size: xmlBytes.length, CreationDate: date, ModDate: date }),
  });
  const fileRef = ctx.register(fileStream);
  const spec = ctx.obj({
    Type: "Filespec",
    F: PDFString.of(FACTURX_FILENAME),
    UF: PDFHexString.fromText(FACTURX_FILENAME),
    Desc: PDFString.of("Factur-X/ZUGFeRD invoice"),
    AFRelationship: "Alternative",
    EF: ctx.obj({ F: fileRef, UF: fileRef }),
  });
  const specRef = ctx.register(spec);
  const names = (catalog.lookupMaybe(PDFName.of("Names"), PDFDict) ??
    (() => {
      const d = ctx.obj({});
      catalog.set(PDFName.of("Names"), d);
      return d;
    })()) as PDFDict;
  const embedded = ctx.obj({ Names: ctx.obj([PDFHexString.fromText(FACTURX_FILENAME), specRef]) });
  names.set(PDFName.of("EmbeddedFiles"), embedded);
  catalog.set(PDFName.of("AF"), ctx.obj([specRef]));

  // XMP metadata, consistent with the document info
  const xmp = new TextEncoder().encode(facturXXmp(meta));
  const metaRef = ctx.register(ctx.stream(xmp, { Type: "Metadata", Subtype: "XML" }));
  catalog.set(PDFName.of("Metadata"), metaRef);
  const info = ctx.obj({
    Title: PDFHexString.fromText(meta.title),
    Author: PDFHexString.fromText(meta.author),
    Creator: PDFHexString.fromText("okinvo"),
    Producer: PDFHexString.fromText("okinvo"),
    CreationDate: date,
    ModDate: date,
  });
  ctx.trailerInfo.Info = ctx.register(info);

  // sRGB output intent, tagged-PDF marker and a stable trailer ID
  const icc = ctx.register(ctx.flateStream(iccProfile(), { N: 3 }));
  const intent = ctx.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    RegistryName: PDFString.of("http://www.color.org"),
    DestOutputProfile: icc,
  });
  catalog.set(PDFName.of("OutputIntents"), ctx.obj([ctx.register(intent)]));
  catalog.set(PDFName.of("MarkInfo"), ctx.obj({ Marked: true }));
  const id = PDFHexString.of(meta.documentId);
  ctx.trailerInfo.ID = ctx.obj([id, id]);

  // PDF/A wants every annotation printable; the templates draw none, but a future one must not break conformance
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i);
      if (a instanceof PDFDict && !a.has(PDFName.of("F"))) a.set(PDFName.of("F"), PDFNumber.of(4));
    }
  }
  return Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
}
