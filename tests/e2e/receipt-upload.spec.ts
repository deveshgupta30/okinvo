import { expect, test } from "@playwright/test";
import { issueSimpleInvoice, signInAs } from "./helpers";

/**
 * A payment receipt goes through the drop zone (addendum §3): a PDF is uploaded through
 * /api/uploads, the payment is recorded with it, and the ledger links to the stored file.
 */
test.skip(({ isMobile }) => !!isMobile, "desktop project only");
test.setTimeout(300_000);

const MINIMAL_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;

test("a PDF receipt is uploaded with a payment and linked from the ledger", async ({ page }) => {
  await signInAs(page, "smoke@example.com", "Smoke Owner");
  const url = await issueSimpleInvoice(page, `Receipt ${Date.now().toString(36)}`);
  // the issue redirect carries a flash message in the query string
  await page.goto(`${new URL(url).pathname}/payments`);

  // a type the receipt field does not take is refused before any upload
  await page
    .locator('input[type="file"][data-kind="RECEIPT"]')
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert").filter({ hasText: "PDF" })).toBeVisible();

  await page.locator('input[type="file"][data-kind="RECEIPT"]').setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(MINIMAL_PDF),
  });
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible({ timeout: 30_000 });

  const ref = `UTR-RCPT-${Date.now().toString(36)}`;
  await page.locator("#amountApplied").fill("100");
  await page.locator("#reference").fill(ref);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText(ref)).toBeVisible();

  const receipt = page
    .getByRole("row", { name: new RegExp(ref) })
    .getByRole("link", { name: "Receipt" });
  const href = await receipt.getAttribute("href");
  expect(href).toMatch(/^\/api\/assets\/id\//);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
});
