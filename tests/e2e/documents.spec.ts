import { expect, test } from "@playwright/test";
import { PDFParse } from "pdf-parse";
import { issueSimpleInvoice, signInAs } from "./helpers";

/**
 * Document downloads (spec §9d): an issued invoice offers the PDF and a DOCX copy; the DOCX bytes
 * are an OOXML package. A document language chosen in the builder (SPEC §4.10) prints its labels.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";

test("an issued invoice downloads as DOCX", async ({ page }) => {
  await signInAs(page, EMAIL, "E2E Owner");
  await issueSimpleInvoice(page, `Docx ${Date.now().toString(36)}`);
  const docx = page.getByRole("link", { name: "Download DOCX" });
  await expect(docx).toBeVisible();
  const href = await docx.getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("wordprocessingml");
  expect(res.headers()["content-disposition"]).toMatch(/\.docx"/);
  expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
  // the PDF is still the PDF
  const pdf = await page.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const pdfRes = await page.request.get(pdf!);
  expect((await pdfRes.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // the Factur-X copy is a PDF with the EN 16931 XML embedded (spec §9e)
  const invoiceId = page.url().split("/invoices/")[1]!.split(/[/?#]/)[0];
  const fx = await page.request.get(`/api/documents/preview?invoice=${invoiceId}&format=facturx`);
  expect(fx.status()).toBe(200);
  expect(fx.headers()["content-disposition"]).toMatch(/-facturx\.pdf"/);
  const fxBytes = await fx.body();
  expect(fxBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(fxBytes.toString("latin1")).toContain("factur-x.xml");
});

test("an invoice issued in German prints German labels", async ({ page }) => {
  await signInAs(page, EMAIL, "E2E Owner");
  await issueSimpleInvoice(page, `Deutsch ${Date.now().toString(36)}`, { documentLocale: "de" });
  const pdf = await page.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const res = await page.request.get(pdf!);
  expect(res.status()).toBe(200);
  const parser = new PDFParse({ data: new Uint8Array(await res.body()) });
  try {
    const text = (await parser.getText()).text;
    expect(text).toContain("RECHNUNG");
    expect(text).toContain("RECHNUNGSEMPFÄNGER");
    expect(text).toContain("30 Tage");
    expect(text).toContain("Seite 1 von 1");
  } finally {
    await parser.destroy();
  }
});
