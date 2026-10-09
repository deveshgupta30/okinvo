import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.setTimeout(300_000);

const EMAIL = "e2e-i18n@example.com";

/**
 * Settings → Account → Language drives the UI locale (spec §8.1): the document `lang` follows
 * the choice on the next render. Task 36 extends this with the translated shell strings.
 */
test("choosing a language sets html[lang] and persists; English (US) restores it", async ({
  page,
}) => {
  await signInAs(page, EMAIL, "I18n Owner");
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

  const language = page.getByLabel("Language");
  // every entry of the table is offered, grouped by region, named in itself
  await expect(language.locator("option")).toHaveCount(115);
  await expect(language.locator("optgroup[label='Europe'] option[value='de']")).toHaveText(
    "Deutsch",
  );
  await language.selectOption("de");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Account preferences saved")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByLabel("Language")).toHaveValue("de");

  // instants follow the UI language: German dates read dd.mm.yyyy on the sessions page
  await page.goto("/settings/security");
  await expect(page.getByText(/\b\d{2}\.\d{2}\.\d{4}\b/).first()).toBeVisible();
  await page.goto("/settings/account");

  // a right-to-left language flips the document direction
  await page.getByLabel("Language").selectOption("ar");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Account preferences saved")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // the shell mirrors: the sidebar sits on the right half of the viewport
  const aside = page.locator("aside[data-sidebar]");
  await expect(aside).toBeVisible();
  const box = await aside.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box!.x).toBeGreaterThan(width / 2);

  // a fresh load before the last change, so the earlier flash cannot satisfy the next assertion
  await page.goto("/settings/account");
  await expect(page.getByLabel("Language")).toHaveValue("ar");
  await page.getByLabel("Language").selectOption("en-US");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Account preferences saved")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
