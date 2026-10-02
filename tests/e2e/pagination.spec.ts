import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * The builder's live preview estimates the printed page count (spec §4.6): thirty lines spill
 * onto a second A4 page and the badge says so.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";

test("a thirty-line invoice shows an estimate of two pages", async ({ page }) => {
  await signInAs(page, EMAIL, "E2E Owner");
  await page.goto("/invoices/new");
  await expect(page.getByRole("button", { name: "Add line" })).toBeVisible();
  const badge = page.locator("[data-page-estimate]");
  await expect(badge).toHaveText(/approx\. 1 page/);

  await page.getByLabel("Line 1 description").fill("Line 1 - consulting");
  for (let i = 2; i <= 30; i++) {
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel(`Line ${i} description`).fill(`Line ${i} - consulting`);
  }
  await expect(badge).toHaveText(/approx\. 2 pages/, { timeout: 30_000 });
  await expect(badge).toHaveAttribute("data-page-estimate", "2");
});
