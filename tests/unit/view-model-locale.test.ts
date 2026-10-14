import { describe, expect, it } from "vitest";
import { sampleRenderInput } from "@/lib/documents/sample";
import { buildDocumentViewModel, type RenderInput } from "@/lib/documents/view-model";
import { DEFAULT_DOCUMENT_MESSAGES, documentMessages } from "@/lib/i18n/document-messages";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/schemas";

/**
 * A document's language (SPEC §4.10) drives its labels, title, page text and the formatting of
 * dates and amounts; a template label override still wins over the catalogue.
 */
const options = {
  appUrl: "https://okinvo.test",
  assetUrl: (id: string) => `/a/${id}`,
  draft: false,
};
const input = (over: Partial<RenderInput>): RenderInput => ({ ...sampleRenderInput(), ...over });

describe("document locale", () => {
  it("takes the labels, title and page text from the catalogue of the document's language", async () => {
    const hi = await documentMessages("hi");
    const vm = buildDocumentViewModel(input({ locale: "hi" }), {
      ...options,
      config: DEFAULT_TEMPLATE_CONFIG,
      messages: hi,
    });
    expect(vm.labels.billTo).toBe(hi.labels.billTo);
    expect(vm.labels.billTo).toMatch(/[ऀ-ॿ]/);
    expect(vm.title).toBe(hi.title.taxInvoice);
    expect(vm.text.pageOf).toBe(hi.text.pageOf);
    expect(vm.text.void).toBe(hi.text.void);
  });

  it("formats dates and amounts in the document's language", async () => {
    const de = await documentMessages("de");
    const vm = buildDocumentViewModel(input({ locale: "de", currency: "EUR", total: "1234.50" }), {
      ...options,
      config: DEFAULT_TEMPLATE_CONFIG,
      messages: de,
    });
    const total = vm.totals.rows.find((r) => r.key === "total");
    expect(total?.value).toBe("1.234,50 €");
    expect(vm.issueDate).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it("keeps the issuer's regional formatting when the document language is the same language", () => {
    // an en-IN issuer printing an English document keeps lakh grouping (SPEC §4.10)
    const vm = buildDocumentViewModel(
      input({ locale: "en-US", currency: "INR", total: "1234567.00" }),
      {
        ...options,
        config: DEFAULT_TEMPLATE_CONFIG,
      },
    );
    expect(vm.totals.rows.find((r) => r.key === "total")?.value).toBe("₹12,34,567.00");
  });

  it("lets a template label override win over the catalogue", async () => {
    const de = await documentMessages("de");
    const config = { ...DEFAULT_TEMPLATE_CONFIG, labels: { billTo: "Rechnungsempfänger" } };
    const vm = buildDocumentViewModel(input({ locale: "de" }), {
      ...options,
      config,
      messages: de,
    });
    expect(vm.labels.billTo).toBe("Rechnungsempfänger");
    expect(vm.labels.shipTo).toBe(de.labels.shipTo);
  });

  it("defaults to en-US strings without messages", () => {
    const vm = buildDocumentViewModel(input({}), { ...options, config: DEFAULT_TEMPLATE_CONFIG });
    expect(vm.labels.billTo).toBe(DEFAULT_DOCUMENT_MESSAGES.labels.billTo);
    expect(vm.text.pageOf).toBe("Page {page} of {total}");
  });
});
