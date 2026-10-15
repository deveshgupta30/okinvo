import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInAs } from "./helpers";

/**
 * Settings → Templates (spec §5.4): pick the Letterhead template, upload a PNG header image, set
 * its opacity, see it in the live preview, and download the sample PDF.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";

test("letterhead with an uploaded header image at half opacity", async ({ page }) => {
  await signInAs(page, EMAIL, "E2E Owner");
  await page.goto("/settings/templates");
  await expect(page.getByRole("radiogroup", { name: "Template" })).toBeVisible();

  await page.getByRole("radio", { name: /Letterhead/ }).click();
  await page.locator("#headerStyle").selectOption("image");

  const png = await sharp({
    create: {
      width: 1200,
      height: 240,
      channels: 4,
      background: { r: 30, g: 120, b: 200, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"][data-kind="LETTERHEAD"]')
    .setInputFiles({ name: "letterhead.png", mimeType: "image/png", buffer: png });
  const preview = page.locator("[data-document-preview]");
  await expect(preview.locator("img[data-header-image]")).toBeVisible({ timeout: 30_000 });

  await page.locator("#headerOpacity").fill("0.5");
  await expect(preview.locator("img[data-header-image]")).toHaveAttribute(
    "style",
    /opacity:\s*0\.5/,
  );

  const href = await page.getByRole("link", { name: /sample pdf/i }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  // Leave the shared instance template as other specs (and the next run) expect it: the image
  // header makes every preview taller and would skew the page estimate elsewhere.
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Template reset to the built-in default")).toBeVisible();
});
