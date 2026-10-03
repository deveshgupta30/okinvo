import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Share links (spec §5.6): the owner creates a password-protected link with a generated
 * passphrase, a stranger in a fresh browser hits the password gate, enters the passphrase, sees
 * the preview and downloads a PDF.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";
const stamp = Date.now().toString(36);

async function issueInvoice(page: Page): Promise<string> {
  const profileLabel = `Share ${stamp}`;
  const clientName = `Share client ${stamp}`;
  await page.goto("/settings/profiles/new");
  await page.locator("#label").fill(profileLabel);
  await page.locator("#legalName").fill("Share Legal Name");
  await page.locator("#email").fill("issuer@example.com");
  await page.locator("#stateCode").selectOption("KA");
  await page.locator('[id="address.line1"]').fill("1 Test Street");
  await page.locator('[id="address.city"]').fill("Bengaluru");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profiles/);

  await page.goto("/clients/new");
  await page.locator("#displayName").fill(clientName);
  await page.locator("#stateCode").selectOption("KA");
  await page.locator('[id="billingAddress.line1"]').fill("2 Client Road");
  await page.locator('[id="billingAddress.city"]').fill("Bengaluru");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  await page.goto("/invoices/new");
  await page.locator("#issuerProfileId").selectOption({ label: profileLabel });
  await page.locator("#clientId").selectOption({ label: clientName });
  await page.getByLabel("Line 1 description").fill("Shared work");
  await page.getByLabel("Line 1 quantity").fill("1");
  await page.getByLabel("Line 1 rate").fill("1000");
  await page.getByRole("button", { name: "Save and issue" }).click();
  await expect(page).toHaveURL(/\/invoices\/[^/]+$/);
  return page.url();
}

test("a protected share link opens for a stranger with the passphrase", async ({
  page,
  browser,
}) => {
  await signInAs(page, EMAIL, "E2E Owner");
  await issueInvoice(page);

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
  await expect(view.getByRole("heading", { name: /Invoice from Share Legal Name/ })).toBeVisible();
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
