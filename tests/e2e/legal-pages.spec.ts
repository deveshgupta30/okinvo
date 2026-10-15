import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Legal pages (spec §6.4): every page renders with a title and a table of contents, shows a
 * highlighted placeholder while the operator's details are unset, and the operator's legal name
 * once Settings → Legal is saved.
 */
test.setTimeout(300_000);

const PAGES: [string, string, number][] = [
  ["/legal/terms", "Terms of Service", 8],
  ["/legal/acceptable-use", "Acceptable Use Policy", 8],
  ["/legal/privacy", "Privacy Policy", 8],
  ["/legal/data-retention", "Data retention", 8],
  ["/legal/security", "Security", 8],
  ["/legal/cookies", "Cookie policy", 5],
  ["/legal/licenses", "Licences and third-party notices", 2],
];

test("every legal page renders with a title and a table of contents", async ({ page }) => {
  for (const [path, title, minToc] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const entries = page.getByRole("navigation", { name: "Contents" }).getByRole("link");
    expect(await entries.count()).toBeGreaterThanOrEqual(minToc);
  }
});

test("operator details flow from Settings → Legal into the documents", async ({ page }) => {
  await signInAs(page, "e2e@example.com", "E2E Owner");
  await page.goto("/settings/legal");
  await expect(page.getByRole("heading", { name: "Legal" })).toBeVisible();

  // clear the legal name → the Terms show the placeholder chip
  await page.locator("#legalName").fill("");
  await page.getByRole("button", { name: "Save operator details" }).click();
  await expect(page.getByText(/Operator details saved/)).toBeVisible();
  await page.goto("/legal/terms");
  await expect(page.locator('[data-placeholder="legalName"]').first()).toBeVisible();

  // fill it → the Terms print the name
  const name = `Legal Op ${Date.now().toString(36)}`;
  await page.goto("/settings/legal");
  await page.locator("#legalName").fill(name);
  await page.locator("#entityType").selectOption("COMPANY");
  await page.locator("#address").fill("1 Legal Street, Bengaluru 560001");
  await page.locator("#country").selectOption("IN");
  await page.locator("#effectiveDate").fill("2026-10-03");
  await page.locator("#contactEmail").fill("legal@example.com");
  await page.locator("#privacyEmail").fill("privacy@example.com");
  await page.locator("#governingLaw").fill("the laws of India");
  await page.locator("#venue").fill("the courts of Bengaluru, Karnataka");
  await page.getByRole("button", { name: "Save operator details" }).click();
  await expect(page.getByText(/Operator details saved/)).toBeVisible();
  await expect(page.getByText("Complete")).toBeVisible();
  await page.goto("/legal/terms");
  await expect(page.locator('[data-operator-field="legalName"]').first()).toHaveText(name);
  await expect(page.locator('[data-placeholder="legalName"]')).toHaveCount(0);
  await expect(page.getByText("the laws of India").first()).toBeVisible();
});
