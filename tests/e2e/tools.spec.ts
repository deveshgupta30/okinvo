import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Tools → Currency (addendum §5): the converter reads the table the instance carries, converts
 * through the base with the amount typed, flips, and says which table it used and as of when.
 */
test("the currency converter converts, flips and names its rate table", async ({ page }) => {
  await signInAs(page, "smoke@example.com", "Smoke Owner");
  await page.goto("/tools/currency");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Currency converter");

  const swap = page.locator("[data-currency-swap]");
  await expect(swap.locator("[data-rates-as-of]")).toContainText(/Exchange rates as of \w+ \d/);
  await expect(swap.locator("[data-rates-as-of]")).toContainText(/bundled|refreshed/);

  await swap.getByRole("combobox", { name: "From" }).selectOption("USD");
  await swap.getByRole("combobox", { name: "To" }).selectOption("JPY");
  await swap.getByRole("textbox", { name: "Amount" }).fill("10");
  // JPY has no minor units: a whole number, somewhere between 500 and 5000 for 10 USD
  const result = swap.locator("[data-result]");
  await expect(result).toHaveText(/^[^.]*¥?[\d,]+$/);
  const yen = Number((await result.innerText()).replace(/[^\d]/g, ""));
  expect(yen).toBeGreaterThan(500);
  expect(yen).toBeLessThan(5000);

  // flip: JPY → USD of the same amount is well under a dollar
  await swap.getByRole("button", { name: "Swap the currencies" }).click();
  await expect(swap.getByRole("combobox", { name: "From" })).toHaveValue("JPY");
  await expect(swap.getByRole("combobox", { name: "To" })).toHaveValue("USD");
  await expect(result).toContainText(/0\.0\d/);

  // a non-number shows the prompt instead of a result
  await swap.getByRole("textbox", { name: "Amount" }).fill("ten");
  await expect(result).toContainText("Enter an amount");

  // the sidebar carries the entry
  await expect(page.getByRole("link", { name: "Currency" }).first()).toHaveAttribute(
    "href",
    "/tools/currency",
  );
});
