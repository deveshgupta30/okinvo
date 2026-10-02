import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Text fields keep only standard keyboard characters (SPEC.md §6.6): typed or pasted text loses
 * anything else before it reaches the form, and the server refuses it regardless.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";

test("a client name loses the characters that are not on the keyboard", async ({ page }) => {
  await signInAs(page, EMAIL, "E2E Owner");
  await page.goto("/clients/new");
  const name = page.locator("#displayName");
  await expect(name).toBeVisible();
  await name.pressSequentially("Müller — Co|\\ Ltd");
  await expect(name).toHaveValue("Mller  Co Ltd");

  // pasting is filtered the same way
  await name.fill("");
  await page.evaluate(() => navigator.clipboard.writeText("Ács & Co. “quoted”").catch(() => {}));
  await name.fill("Ács & Co. “quoted”");
  await expect(name).toHaveValue("cs & Co. quoted");
});
