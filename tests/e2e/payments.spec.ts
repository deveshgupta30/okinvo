import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { issueSimpleInvoice, signInAs } from "./helpers";

/**
 * Payment checkpoints and receipts (addendum §4): receipts go through the drop zone (several per
 * payment, PDF or image, uploaded through /api/uploads), the ledger links each one, and the
 * invoice page's progress list ticks Issued, Payment recorded, Paid in full and Receipt attached.
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
const tinyPng = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 9, g: 8, b: 7 } } })
    .png()
    .toBuffer();

test("receipts are uploaded with a payment, linked from the ledger, and the progress list fills in", async ({
  page,
}) => {
  await signInAs(page, "smoke@example.com", "Smoke Owner");
  const url = await issueSimpleInvoice(page, `Receipt ${Date.now().toString(36)}`);
  const invoicePath = new URL(url).pathname; // the issue redirect carries a flash query string

  // issued, nothing paid: the progress list shows the first checkpoint done and the rest pending
  await page.goto(invoicePath);
  const progress = page.locator("[data-payment-progress]");
  await expect(progress.locator('[data-checkpoint="issued"]')).toHaveAttribute("data-done", "true");
  await expect(progress.locator('[data-checkpoint="paid"]')).toHaveAttribute("data-done", "false");
  await expect(progress.locator('[data-checkpoint="receipt"]')).toHaveAttribute(
    "data-done",
    "false",
  );

  await page.goto(`${invoicePath}/payments`);
  const fileInput = page.locator('input[type="file"][data-kind="RECEIPT"]');

  // a type the receipt field does not take is refused before any upload
  await fileInput.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("x"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "PDF" })).toBeVisible();

  // two receipts at once: a PDF and an image
  await fileInput.setInputFiles([
    { name: "receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from(MINIMAL_PDF) },
    { name: "bill.png", mimeType: "image/png", buffer: await tinyPng() },
  ]);
  const uploaded = page.getByRole("list", { name: "Receipts and bills" }).getByRole("listitem");
  await expect(uploaded).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('input[name="attachmentAssetIds"]')).toHaveCount(2);

  // a third one can be removed again before recording
  await fileInput.setInputFiles({
    name: "extra.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(MINIMAL_PDF),
  });
  await expect(uploaded).toHaveCount(3, { timeout: 30_000 });
  await page.getByRole("button", { name: "Remove receipt 3" }).click();
  await expect(uploaded).toHaveCount(2);

  const ref = `UTR-RCPT-${Date.now().toString(36)}`;
  await page.locator("#amountApplied").fill("100");
  await page.locator("#reference").fill(ref);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText(ref)).toBeVisible();

  // the ledger row links both receipts, served as what was uploaded
  const row = page.getByRole("row", { name: new RegExp(ref) });
  const first = row.getByRole("link", { name: "Receipt 1" });
  const second = row.getByRole("link", { name: "Receipt 2" });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const pdfHref = await first.getAttribute("href");
  expect(pdfHref).toMatch(/^\/api\/assets\/id\//);
  const pdfRes = await page.request.get(pdfHref!);
  expect(pdfRes.status()).toBe(200);
  expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
  const imgRes = await page.request.get((await second.getAttribute("href"))!);
  expect(imgRes.headers()["content-type"]).toContain("image/");

  // editing keeps the receipts and lets one go
  await row.getByRole("link", { name: "Edit" }).click();
  await expect(uploaded).toHaveCount(2);
  await page.getByRole("button", { name: "Remove receipt 2" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(ref)).toBeVisible();
  await expect(row.getByRole("link", { name: "Receipt", exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "Receipt 2" })).toHaveCount(0);

  // the progress list: one payment line, receipt attached, still not paid in full
  await page.goto(invoicePath);
  await expect(progress.locator('[data-checkpoint="payment"]')).toHaveCount(1);
  await expect(progress.locator('[data-checkpoint="payment"]')).toHaveAttribute(
    "data-done",
    "true",
  );
  await expect(progress.locator('[data-checkpoint="payment"]')).toContainText("100.00");
  await expect(progress.locator('[data-checkpoint="receipt"]')).toHaveAttribute(
    "data-done",
    "true",
  );
  await expect(progress.locator('[data-checkpoint="paid"]')).toHaveAttribute("data-done", "false");

  // settle the rest (the helper's issuer applies no tax: 1000 total, 900 left): Paid in full
  await page.goto(`${invoicePath}/payments`);
  await page.locator("#amountApplied").fill("900");
  await page.locator("#reference").fill(`${ref}-2`);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText(`${ref}-2`)).toBeVisible();
  await page.goto(invoicePath);
  await expect(page.locator("h1 [data-status]")).toHaveAttribute("data-status", "PAID");
  await expect(progress.locator('[data-checkpoint="payment"]')).toHaveCount(2);
  await expect(progress.locator('[data-checkpoint="paid"]')).toHaveAttribute("data-done", "true");
  await expect(progress.getByText("Paid in full")).toBeVisible();
});
