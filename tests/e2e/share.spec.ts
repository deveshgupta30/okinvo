import { expect, test } from "@playwright/test";
import { issueSimpleInvoice, signInAs } from "./helpers";

/**
 * Share links (spec §5.6): the owner creates a password-protected link with a generated
 * passphrase, a stranger in a fresh browser hits the password gate, enters the passphrase, sees
 * the preview and downloads a PDF.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";
const stamp = Date.now().toString(36);

test("a protected share link opens for a stranger with the passphrase", async ({
  page,
  browser,
}) => {
  await signInAs(page, EMAIL, "E2E Owner");
  await issueSimpleInvoice(page, `Share ${stamp}`);

  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#share-protection").selectOption("auto");
  await dialog.getByRole("button", { name: "Create link" }).click();
  await expect(dialog.getByText("Share link created.")).toBeVisible({ timeout: 60_000 });
  const link = (await dialog.locator("code").first().textContent())?.trim() ?? "";
  const passphrase = (await dialog.locator("[data-share-password]").textContent())?.trim() ?? "";
  expect(link).toMatch(/\/i\/[A-Za-z0-9_-]{20,64}$/);
  expect(passphrase.split("-").length).toBeGreaterThanOrEqual(6);
  await page.keyboard.press("Escape");

  // a stranger: fresh context, no session
  const stranger = await browser.newContext();
  const view = await stranger.newPage();
  await view.goto(link);
  await expect(
    view.getByRole("heading", { name: /Invoice from Share .* Legal Name/ }),
  ).toBeVisible();
  // Dev only: the first POST to a not-yet-compiled route handler triggers an HMR reload that
  // aborts the browser's form navigation, so compile it once with a throwaway request.
  await view.request.post(`${link}/password`, { form: { password: "" } });
  await view.locator("#share-password").fill("wrong-wrong-wrong");
  await view.getByRole("button", { name: "Open document" }).click();
  await expect(view.getByText(/not right/)).toBeVisible();
  await view.locator("#share-password").fill(passphrase);
  await view.getByRole("button", { name: "Open document" }).click();
  await expect(view.locator("[data-document-preview]")).toContainText("Shared work", {
    timeout: 60_000,
  });
  const href = await view.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const res = await view.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await stranger.close();
  // view and download counts, revocation and expiry are covered by tests/integration/share-links
});
