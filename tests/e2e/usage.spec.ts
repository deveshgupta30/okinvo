import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Settings > Usage (addendum §2 item 19, review finding 3): the shell's beacon counts every
 * screen, including soft navigations that never re-render the app layout. The test server runs
 * with ANALYTICS_LOCAL=true (playwright.config.ts).
 */
test.skip(({ isMobile }) => !!isMobile, "desktop project only");

test("soft navigations are counted and listed under Settings > Usage", async ({ page }) => {
  await signInAs(page, "smoke@example.com", "Smoke Owner");

  // a hard load, then two client-side navigations through the sidebar
  const beat = () =>
    page.waitForResponse(
      (r) => r.url().endsWith("/api/usage/view") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
  const first = beat();
  await page.goto("/invoices");
  expect((await first).status()).toBe(204);

  const second = beat();
  await page.getByRole("link", { name: "Clients", exact: true }).first().click();
  await expect(page).toHaveURL(/\/clients$/);
  expect((await second).status()).toBe(204);

  const third = beat();
  await page.getByRole("link", { name: "Products", exact: true }).first().click();
  await expect(page).toHaveURL(/\/products$/);
  expect((await third).status()).toBe(204);

  await page.goto("/settings/usage");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Usage");
  const screens = page.getByRole("table").getByRole("row");
  await expect(screens.filter({ hasText: "/clients" }).first()).toBeVisible();
  await expect(screens.filter({ hasText: "/products" }).first()).toBeVisible();
  await expect(screens.filter({ hasText: "/invoices" }).first()).toBeVisible();
});
