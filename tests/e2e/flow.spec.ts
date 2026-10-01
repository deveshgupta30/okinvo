import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * The whole owner journey through the real UI (SPEC §4, v2 §19). Needs AUTH_PASSWORD_SIGNIN=true
 * and an allow-list that admits *@example.com on the server under test.
 */
test.describe.configure({ mode: "serial" });
// Many navigations against a dev server whose first compiles are slow.
test.setTimeout(240_000);

const stamp = Date.now();
const email = `e2e-${stamp}@example.com`;
const password = "correct horse battery staple";
const profileLabel = `E2E profile ${stamp}`;
const clientName = `E2E client ${stamp}`;
const serviceName = `E2E service ${stamp}`;

async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  const form = page.getByTestId("password-sign-in");
  // The toggle is client-side: keep clicking until hydration makes it take effect.
  await expect(async () => {
    await form.getByRole("button", { name: /First time here/ }).click();
    await expect(form.getByLabel("Name")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await form.getByLabel("Name").fill("E2E Owner");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

test("sign in, master data, invoice, issue, download, verify", async ({ page }) => {
  await signIn(page);

  // Issuer profile
  await page.goto("/settings/profiles/new");
  await page.locator("#label").fill(profileLabel);
  await page.locator("#legalName").fill("E2E Legal Name");
  await page.locator("#email").fill("issuer@example.com");
  await page.locator("#stateCode").selectOption("KA");
  await page.locator('[id="address.line1"]').fill("1 Test Street");
  await page.locator('[id="address.city"]').fill("Bengaluru");
  await page.locator("#gstin").fill("29ABCDE1234F1Z5");
  await page.locator("#panNumber").fill("ABCDE1234F");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profiles/);
  await expect(page.getByRole("cell", { name: profileLabel })).toBeVisible();

  // Client
  await page.goto("/clients/new");
  await page.locator("#displayName").fill(clientName);
  await page.locator("#email").fill("client@example.com");
  await page.locator("#stateCode").selectOption("MH");
  await page.locator("#taxIdType").selectOption("GSTIN");
  await page.locator("#taxId").fill("27AAAAA0000A1Z5");
  await page.locator('[id="billingAddress.line1"]').fill("2 Client Road");
  await page.locator('[id="billingAddress.city"]').fill("Mumbai");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  // Service
  await page.goto("/services/new");
  await page.locator("#name").fill(serviceName);
  await page.locator("#defaultRate").fill("2500");
  await page.locator("#sacHsnCode").fill("998314");
  await page.getByRole("button", { name: "Save service" }).click();
  await expect(page.getByRole("cell", { name: serviceName })).toBeVisible();

  // Invoice: catalogue line + ad hoc line, live preview, save & issue
  await page.goto("/invoices/new");
  await page.locator("#issuerProfileId").selectOption({ label: profileLabel });
  await page.locator("#clientId").selectOption({ label: clientName });
  await page.getByLabel("Add from catalogue").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Line 2 description").fill("Ad hoc consulting");
  await page.getByLabel("Line 2 SAC/HSN").fill("998314");
  await page.getByLabel("Line 2 quantity").fill("2");
  await page.getByLabel("Line 2 rate").fill("1000");
  const preview = page.locator("[data-document-preview]");
  await expect(preview).toContainText("E2E Legal Name");
  await expect(preview).toContainText("Ad hoc consulting");
  await expect(preview).toContainText("DRAFT");
  await page.getByRole("button", { name: "Save and issue" }).click();
  await expect(page).toHaveURL(/\/invoices\/[^/]+$/);
  const numberCell = page.locator("h1");
  await expect(numberCell).toContainText(/INV\/\d\d-\d\d\/\d{3}/);
  const number = (await numberCell.textContent())?.match(/INV\/\d\d-\d\d\/\d{3}/)?.[0];
  expect(number).toBeTruthy();
  await expect(page.locator("h1 [data-status]")).toHaveAttribute("data-status", "ISSUED");
  // IGST because issuer (KA) and client (MH) differ; 2500 + 2000 = 4500 taxable, 18 % = 810.
  await expect(page.getByRole("term").filter({ hasText: "IGST 18%" })).toBeVisible();
  await expect(page.getByText("₹5,310.00").first()).toBeVisible();

  // Download the stored PDF and compare its hash with the one the page shows
  const invoiceId = new URL(page.url()).pathname.split("/").pop();
  const download = await page.request.get(`/api/documents/preview?invoice=${invoiceId}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("application/pdf");
  const bytes = await download.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await page.reload();
  const shaOnPage = await page
    .locator("li:has-text('Version 1') .text-app-mono")
    .first()
    .textContent();
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(shaOnPage?.trim());

  // Verify page: public, valid, lists the hash
  const verifyHref = await page.getByRole("link", { name: /\/verify\// }).getAttribute("href");
  await page.context().clearCookies();
  await page.goto(verifyHref!);
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(number!);
  await expect(page.getByText(shaOnPage!.trim())).toBeVisible();
  await page.goto("/verify/definitely-not-a-token-0000000000");
  await expect(page.getByText("No such document")).toBeVisible();
});
