import { expect, test } from "@playwright/test";
import { signInAs, waitHydrated } from "./helpers";

/**
 * First-run wizard (spec §4.2). The fixed owner e2e-onboard@example.com is created on the first
 * run against a database and walked through the wizard; later runs only prove the wizard never
 * comes back. Runs on the desktop and the phone project.
 */
test.setTimeout(300_000);

const EMAIL = "e2e-onboard@example.com";

test("a new owner is walked through onboarding into a prefilled profile, once", async ({
  page,
}) => {
  await signInAs(page, EMAIL, "Onboard Owner", { completeOnboarding: false });
  if (!page.url().includes("/onboarding")) {
    // Already onboarded on this database: the wizard must stay away.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, /);
    return;
  }

  // Step 1 - identity: a country is preselected from the browser; pick India explicitly.
  await expect(page.getByRole("heading", { name: /Tell us about you/ })).toBeVisible();
  await waitHydrated(page);
  const country = page.getByLabel("Country");
  await expect(country).not.toHaveValue("");
  await country.selectOption("IN");
  await expect(page.getByLabel("Preferred currency")).toHaveValue("INR");
  await expect(page.getByLabel("Email")).toHaveValue(EMAIL);
  await expect(page.getByLabel("Email")).toHaveAttribute("readonly", "");
  await page.getByLabel("Name").fill("Onboard Owner");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 - usage and GSTIN
  await expect(page.getByRole("heading", { name: /How will you use okinvo/ })).toBeVisible();
  await waitHydrated(page);
  await page.getByRole("radio", { name: /Business invoicing/ }).check();
  await page.getByRole("radio", { name: "Yes" }).check();
  const gstin = page.getByLabel("GSTIN");
  await gstin.fill("29ABCDE1234F1Z5");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /GSTIN/ })).toBeVisible();
  await gstin.fill("27AAPFU0939F1ZV");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 - done
  await expect(page.getByRole("heading", { name: /You're set/ })).toBeVisible();
  await waitHydrated(page);
  await page.getByRole("button", { name: /Go to profiles/ }).click();
  await expect(page).toHaveURL(/\/settings\/profiles\/new\?from=onboarding/);
  await expect(page.locator("#legalName")).toHaveValue("Onboard Owner");
  await expect(page.locator("#gstin")).toHaveValue("27AAPFU0939F1ZV");
  await expect(page.locator("#countryCode")).toHaveValue("IN");
  await expect(page.locator("#baseCurrency")).toHaveValue("INR");
  await expect(page.locator("#defaultTaxRegime")).toHaveValue("INDIA_GST");

  // The gate is lifted: the dashboard greets, and the wizard URL bounces back home.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, Onboard/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
});
