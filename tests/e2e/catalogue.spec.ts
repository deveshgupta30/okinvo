import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Products (spec §5.1) and profile tags (§5.2) through the UI: a product with a SKU appears in
 * the builder's catalogue picker, the line carries the SKU into the preview, and the Profiles
 * checkbox group on the catalogue forms is wired to the tags.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";

test("a product with a SKU is picked into an invoice and printed under the description", async ({
  page,
}) => {
  await signInAs(page, EMAIL, "E2E Owner");
  const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;

  await page.goto("/products/new");
  await page.locator("#sku").fill(sku);
  await page.locator("#name").fill("E2E widget");
  await page.locator("#unitPrice").fill("250");
  await page.locator("#hsnCode").fill("8471");
  await page.locator("#defaultTaxRate").fill("18");
  // the Profiles group is present (tags) and left empty = offered to every profile
  await expect(page.getByRole("group", { name: "Profiles" })).toBeVisible();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page).toHaveURL(/\/products/);
  await expect(page.getByText(sku)).toBeVisible();

  await page.goto("/invoices/new");
  await expect(page.getByLabel("Add from catalogue")).toBeVisible();
  const picker = page.getByLabel("Add from catalogue");
  const option = picker.locator("option", { hasText: sku });
  await expect(option).toHaveCount(1);
  await picker.selectOption({ label: await option.textContent().then((t) => t?.trim() ?? "") });
  await expect(page.getByText(`SKU ${sku}`).first()).toBeVisible();
  await expect(page.locator("[data-document-preview]")).toContainText(`SKU ${sku}`);
});
