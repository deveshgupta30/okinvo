import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInAs } from "./helpers";

test.setTimeout(240_000);

test("profile photo: crop dialog, upload, circle everywhere, remove", async ({ page }) => {
  await signInAs(page, "smoke@example.com", "Smoke Owner");
  await page.goto("/settings/account");
  // The stored display name is whatever the first run saved; read it rather than assume it.
  const name = await page.getByLabel("Display name").inputValue();
  expect(name.length).toBeGreaterThan(0);
  // A previous run may have left a photo behind: start from the initials state.
  const existing = page.locator(`main img[alt="${name}"]`);
  if ((await existing.count()) > 0) {
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(existing).toHaveCount(0, { timeout: 30_000 });
  }
  // No photo: initials on the accent colour (an img role without an <img>).
  await expect(page.getByRole("main").getByRole("img", { name }).first()).toBeVisible();

  const png = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 120, g: 180, b: 90 } },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Choose a profile photo")
    .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  const dialog = page.getByRole("dialog", { name: "Position your photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const img = page.locator(`main img[alt="${name}"]`).first();
  await expect(img).toBeVisible({ timeout: 30_000 });
  await expect(img).toHaveAttribute("src", /\/api\/assets\/assets\/avatar\//);
  await expect(img).toHaveClass(/rounded-full/);

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(`main img[alt="${name}"]`)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("main").getByRole("img", { name }).first()).toBeVisible();
});
