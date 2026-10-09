import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

test.setTimeout(300_000);

const EMAIL = "e2e-i18n@example.com";

/**
 * Settings → Account → Language drives the UI locale (spec §8.1): `lang` and `dir` follow the
 * choice, instants are formatted with it, the shell reads from the generated catalogues
 * (spec §8.2) and a right-to-left language mirrors the layout. Once the UI is no longer English
 * the steps address the field by id and the form by its submit button.
 */
const language = (page: Page) => page.locator("#locale");
const save = (page: Page) =>
  page
    .locator("form")
    .filter({ has: page.locator("#locale") })
    .locator('button[type="submit"]')
    .click();
async function choose(page: Page, tag: string) {
  await page.goto("/settings/account");
  await expect(language(page)).toBeVisible();
  await language(page).selectOption(tag);
  await save(page);
  await expect(page.locator("html")).toHaveAttribute("lang", tag);
}

test("the account language drives lang, dir, dates, catalogues and layout", async ({ page }) => {
  await signInAs(page, EMAIL, "I18n Owner");
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

  // every entry of the table is offered, grouped by region, named in itself
  await expect(language(page).locator("option")).toHaveCount(115);
  await expect(language(page).locator("optgroup[label='Europe'] option[value='de']")).toHaveText(
    "Deutsch",
  );

  // German: the generated catalogue is used and labelled, dates read dd.mm.yyyy
  await choose(page, "de");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(language(page)).toHaveValue("de");
  await expect(
    page.locator("aside[data-sidebar]").getByRole("link", { name: "Einstellungen" }),
  ).toBeVisible();
  await expect(page.locator("[data-machine-translated]")).toBeVisible();
  await page.goto("/settings/security");
  await expect(page.getByText(/\b\d{2}\.\d{2}\.\d{4}\b/).first()).toBeVisible();

  // Arabic: right-to-left, the sidebar sits on the right half of the viewport
  await choose(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const aside = page.locator("aside[data-sidebar]");
  await expect(aside).toBeVisible();
  const box = await aside.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box!.x).toBeGreaterThan(width / 2);

  // Hindi: the Settings link is in Devanagari; Japanese: lang follows
  await choose(page, "hi");
  await expect(page.locator("aside[data-sidebar] a[href='/settings']")).toHaveText(/[ऀ-ॿ]/);
  await choose(page, "ja");

  // back to English (US): everything restored, including the English flash
  await choose(page, "en-US");
  await expect(page.getByText("Account preferences saved")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("[data-machine-translated]")).toHaveCount(0);
});
