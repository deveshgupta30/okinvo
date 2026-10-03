import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.setTimeout(300_000);

const EMAIL = "smoke@example.com";

test("Account: choosing a country suggests its currency; region and language persist", async ({
  page,
}) => {
  await signInAs(page, EMAIL, "Smoke Owner");
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();

  const country = page.getByLabel("Country");
  const currency = page.getByLabel("Currency");
  const language = page.getByLabel("Language");
  // A fresh pick follows the country until the currency is touched by hand.
  await expect(async () => {
    await country.selectOption("GB");
    await expect(currency).toHaveValue("GBP", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: "United Kingdom" })).toBeVisible();
  await language.selectOption("en-GB");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Account preferences saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Country")).toHaveValue("GB");
  await expect(page.getByLabel("Currency")).toHaveValue("GBP");
  await expect(page.getByLabel("Language")).toHaveValue("en-GB");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByText("okinvo.theme")).toBeVisible();

  // Leave the shared account the way other specs expect it.
  await expect(async () => {
    await page.getByLabel("Country").selectOption("IN");
    await expect(page.getByLabel("Currency")).toHaveValue("INR", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await page.getByLabel("Language").selectOption("en-US");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Account preferences saved")).toBeVisible();
});

test("Status: the database row is OK and the version is shown", async ({ page }) => {
  await signInAs(page, EMAIL, "Smoke Owner");
  await page.goto("/settings/status");
  await expect(page.getByRole("heading", { name: "Status", level: 1 })).toBeVisible();
  await expect(page.locator("[data-status-version]")).toHaveText(/^\d+\.\d+\.\d+/);
  const db = page.locator('[data-status-row="Database"]');
  await expect(db).toContainText("OK");
  await expect(db).toContainText(/last migration/);
  await expect(page.locator('[data-status-row="Storage"]')).toContainText("OK");
  const res = await page.request.get("/api/health/status");
  expect([200, 503]).toContain(res.status());
  const json = (await res.json()) as { db: { health: string }; version: { app: string } };
  expect(json.db.health).toBe("ok");
  expect(json.version.app).toMatch(/^\d+\.\d+\.\d+/);
});
