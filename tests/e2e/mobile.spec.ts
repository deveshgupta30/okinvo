import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/** Phone-width layout checks; runs under the `mobile` Playwright project only. */
test.skip(({ isMobile }) => !isMobile, "mobile project only");
test.setTimeout(300_000);

const EMAIL = "smoke@example.com";

async function noHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, "page must not scroll sideways").toBeLessThanOrEqual(innerWidth + 1);
}

test("signed-in pages fit the phone width and keep their primary action", async ({ page }) => {
  await signInAs(page, EMAIL, "Smoke Owner");
  for (const path of ["/", "/invoices", "/clients", "/services", "/settings/account"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalOverflow(page);
  }
  await page.goto("/invoices");
  await expect(page.getByRole("link", { name: "New invoice" })).toBeVisible();
  // the register renders as cards: a column label is visible next to a value
  const labelled = page.locator("table.table-cards td[data-label]").first();
  if ((await labelled.count()) > 0) {
    const before = await labelled.evaluate((el) => getComputedStyle(el, "::before").content);
    expect(before).not.toBe("none");
  }
});

test("the dock sits at the bottom, the sidebar is hidden, and the dock navigates", async ({
  page,
}) => {
  await signInAs(page, EMAIL, "Smoke Owner");
  await page.goto("/");
  const dock = page.locator("[data-dock]");
  await expect(dock).toBeVisible();
  await expect(page.locator("aside[data-sidebar]")).toBeHidden();
  await dock.getByRole("link", { name: "Invoices" }).click();
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invoices");
  await dock.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
});

test("the invoice builder stacks on a phone and still previews", async ({ page }) => {
  await signInAs(page, EMAIL, "Smoke Owner");
  await page.goto("/invoices/new");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noHorizontalOverflow(page);
  await expect(page.locator("[data-document-preview]")).toBeVisible();
});
