import { expect, test } from "@playwright/test";
import { issueSimpleInvoice, signInAs } from "./helpers";

/**
 * Document downloads (spec §9d): an issued invoice offers the PDF and a DOCX copy; the DOCX bytes
 * are an OOXML package.
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
});
