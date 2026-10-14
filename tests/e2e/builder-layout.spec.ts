import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * The line-items table of the builder keeps its inputs usable when the form column is narrower
 * than the table (a 1440 px laptop with the sidebar open): the table scrolls sideways inside its
 * card instead of squeezing the quantity, unit, rate and tax fields to a few pixels.
 */
test.skip(({ isMobile }) => !!isMobile, "desktop layout only");
test.setTimeout(180_000);

test("the builder's line inputs stay usable at 1440 px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAs(page, "e2e@example.com", "E2E Owner");
  await page.goto("/invoices/new");
  await expect(page.locator("[data-document-preview]")).toBeVisible();
  const qty = page.getByLabel("Line 1 quantity");
  const rate = page.getByLabel("Line 1 rate");
  await expect(qty).toBeVisible();
  const [qtyBox, rateBox] = await Promise.all([qty.boundingBox(), rate.boundingBox()]);
  expect(qtyBox?.width ?? 0).toBeGreaterThanOrEqual(64);
  expect(rateBox?.width ?? 0).toBeGreaterThanOrEqual(96);
});
