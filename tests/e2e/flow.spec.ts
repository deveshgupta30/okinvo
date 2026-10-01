import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

/**
 * The whole owner journey through the real UI (SPEC §4, v2 §19). Needs AUTH_PASSWORD_SIGNIN=true
 * and an allow-list that admits *@example.com on the server under test.
 */
test.describe.configure({ mode: "serial" });
// Many navigations against a dev server whose first compiles are slow.
test.setTimeout(600_000);

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

/** The existing account, through the password sign-in (not sign-up) branch of the same form. */
async function signInAgain(page: Page) {
  await page.goto("/auth/sign-in");
  const form = page.getByTestId("password-sign-in");
  await expect(async () => {
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Password").fill(password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 60_000 });
}

test("sign in, master data, invoice, issue, download, verify, pay, credit, template, export", async ({
  page,
}) => {
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

  // Back in as the same owner through the password sign-in branch
  await signInAgain(page);

  // Partial payment → PARTIALLY_PAID (a fully paid invoice could not take a credit note)
  await page.goto(`/invoices/${invoiceId}/payments`);
  await page.locator("#amountApplied").fill("2000");
  await page.locator("#reference").fill("UTR-E2E-1");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("UTR-E2E-1")).toBeVisible();
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.locator("h1 [data-status]")).toHaveAttribute("data-status", "PARTIALLY_PAID");
  await expect(page.getByText("₹3,310.00").first()).toBeVisible(); // 5310 − 2000

  // Credit note for 1000 + 18 % IGST = 1180 → balance 2130
  await page.goto(`/credit-notes/new?invoice=${invoiceId}`);
  await page.locator("#subtotal").fill("1000");
  await page.locator("#reason").fill("E2E partial cancellation");
  await page.getByRole("button", { name: "Save and issue" }).click();
  await expect(page).toHaveURL(/\/credit-notes\/[^/]+$/);
  await expect(page.locator("h1")).toContainText(/CN\/\d\d-\d\d\/\d{3}/);
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByText("₹2,130.00").first()).toBeVisible();

  // Settle the rest → PAID
  await page.goto(`/invoices/${invoiceId}/payments`);
  await page.locator("#amountApplied").fill("2130");
  await page.locator("#reference").fill("UTR-E2E-2");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("UTR-E2E-2")).toBeVisible(); // the action redirected to the ledger
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.locator("h1 [data-status]")).toHaveAttribute("data-status", "PAID");
  await expect(page.getByText("₹0.00").first()).toBeVisible();

  // Changing the template later never rewrites an issued document
  await page.goto("/settings/templates");
  const accentText = page.locator("#accent ~ input");
  await accentText.fill("#aa3366");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  const again = await page.request.get(`/api/documents/preview?invoice=${invoiceId}`);
  expect(again.status()).toBe(200);
  expect(
    createHash("sha256")
      .update(await again.body())
      .digest("hex"),
  ).toBe(shaOnPage?.trim());

  // Exports: CSV (BOM, header, our number) and XLSX (typed workbook with a Filters sheet)
  const csv = await page.request.get(
    `/api/exports/invoices?format=csv&q=${encodeURIComponent(number!)}`,
  );
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const csvText = (await csv.body()).toString("utf8");
  expect(csvText.startsWith("﻿Number,Status,Issue date")).toBe(true);
  expect(csvText).toContain(`${number},PAID,`);
  const xlsx = await page.request.get(
    `/api/exports/invoices?format=xlsx&q=${encodeURIComponent(number!)}`,
  );
  expect(xlsx.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await xlsx.body()) as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet("Invoices register");
  expect(sheet?.getRow(1).getCell(1).value).toBe("Number");
  expect(sheet?.getRow(2).getCell(1).value).toBe(number);
  expect(sheet?.getRow(2).getCell(20).value).toBe(5310); // Total, a numeric cell
  expect(wb.getWorksheet("Filters")?.getRow(1).getCell(2).value).toBe("invoices");

  // Sessions page lists this device
  await page.goto("/settings/security");
  await expect(page.getByText("This device")).toBeVisible();
});
