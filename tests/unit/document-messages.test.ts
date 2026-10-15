import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT_MESSAGES, documentMessages } from "@/lib/i18n/document-messages";
import { LABEL_KEYS } from "@/lib/schemas/template-config";

/**
 * Documents print in their own language (SPEC §4.10): the `documents` namespace of every
 * catalogue carries the fixed strings a PDF/DOCX/preview needs, and `documentMessages(locale)`
 * resolves them with en-US behind any gap.
 */
type Tree = { [k: string]: string | Tree };
const dir = join(process.cwd(), "messages");
const read = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree;
const paths = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [prefix + k] : paths(v, `${prefix}${k}.`),
  );
const documentPaths = (tree: Tree) => {
  const docs = tree.documents;
  if (!docs || typeof docs === "string") return [];
  const { ui: _ui, ...rest } = docs;
  return paths(rest).sort();
};

describe("documents namespace", () => {
  const base = read("en-US.json");
  const expected = documentPaths(base);

  it("en-US carries a label for every template label key, the titles and the page text", () => {
    for (const key of LABEL_KEYS) expect(expected).toContain(`labels.${key}`);
    for (const key of ["taxInvoice", "billOfSupply", "invoice", "creditNote"])
      expect(expected).toContain(`title.${key}`);
    for (const key of [
      "pageOf",
      "scanToVerify",
      "taxId",
      "void",
      "draftWatermark",
      "paymentTermsDays",
    ])
      expect(expected).toContain(`text.${key}`);
  });

  it.each(readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en-US.json"))(
    "%s has the full namespace",
    (file) => {
      // en-GB is a spelling overlay; it needs only the strings that differ
      if (file === "en-GB.json") return;
      expect(documentPaths(read(file))).toEqual(expected);
    },
  );
});

describe("documentMessages", () => {
  it("returns the catalogue's strings for a generated locale", async () => {
    const de = await documentMessages("de");
    expect(de.labels.billTo).not.toBe(DEFAULT_DOCUMENT_MESSAGES.labels.billTo);
    expect(de.title.invoice).toMatch(/rechnung/i);
    expect(de.text.pageOf).toContain("{page}");
    expect(de.text.pageOf).toContain("{total}");
  });
  it("falls back to en-US for an unknown or a base locale", async () => {
    expect(await documentMessages("xx")).toEqual(DEFAULT_DOCUMENT_MESSAGES);
    expect(await documentMessages("en-US")).toEqual(DEFAULT_DOCUMENT_MESSAGES);
    expect(DEFAULT_DOCUMENT_MESSAGES.labels.billTo).toBe("Bill to");
    expect(DEFAULT_DOCUMENT_MESSAGES.title.taxInvoice).toBe("TAX INVOICE");
  });
});
